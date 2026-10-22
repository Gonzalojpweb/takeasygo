// ============================================================================
// Ventas → inventario (DECISIONES_VIGENTES D-04, D-10)
// ============================================================================
// syncOrderConsumption(order) compara lo que la orden dice HOY con lo que el
// ledger ya registró y emite solo la diferencia (un SaleRecorded por línea).
// Se llama desde:
//   · onOrderConfirmed  — TODOS los canales (POS, web, transferencia, MP)
//   · rutas del POS que cambian ítems o cancelan
//   · cambio de estado del admin (cancelación)
//   · cron diario de reconciliación (red de seguridad)
//
// Nunca lanza hacia el llamador: una falla de inventario JAMÁS debe impedir
// vender. Si algo falla, el cron lo corrige porque la operación es idempotente.
//
// Solo actúa si la sede tiene inventario activo (depósito de consumo) y el
// plan del tenant incluye inventario.
// ============================================================================

import mongoose from 'mongoose'
import InventoryLedger from '@/models/InventoryLedger'
import InventoryRecipe from '@/models/InventoryRecipe'
import InventoryModifierRule from '@/models/InventoryModifierRule'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import {
  explodeSaleLine,
  flattenModifiers,
  modifierLabel,
  orderConsumes,
  planSaleCorrections,
  saleEventId,
  summarizeRecorded,
  type DesiredSaleLine,
  type SelectedModifier,
  type SkuUnitInfo,
} from '@takeasygo/business/inventory'
import { canAccess, type Plan } from '@/lib/plans'
import { appendEvents, type NewLedgerEvent } from './projector'
import { consumptionStorageFor, dishRecipeKey } from './catalog'
import InventorySKU from '@/models/InventorySKU'

interface OrderLike {
  _id: unknown
  tenantId: unknown
  locationId: unknown
  orderNumber?: string | null
  status: string
  posId?: string | null
  source?: string | null
  confirmedAt?: Date | null
  statusTimestamps?: { confirmedAt?: Date | null } | null
  createdAt?: Date
  items: Array<{
    _id?: unknown
    menuItemId?: unknown
    itemType?: string
    name: string
    quantity: number
    selectedVariant?: { name?: string } | null
    customizations?: unknown[]
  }>
}

export interface SyncResult {
  skipped?: 'no_inventory' | 'no_location'
  events: number
  unmappedLines: number
}

const planCache = new Map<string, { plan: Plan; at: number }>()

async function tenantHasInventory(tenantId: string): Promise<boolean> {
  const cached = planCache.get(tenantId)
  if (cached && Date.now() - cached.at < 60_000) return canAccess(cached.plan, 'inventory')
  const t = await Tenant.findById(tenantId).select('plan').lean<{ plan?: Plan }>()
  const plan = (t?.plan ?? 'try') as Plan
  planCache.set(tenantId, { plan, at: Date.now() })
  return canAccess(plan, 'inventory')
}

function confirmedAtOf(order: OrderLike): Date {
  return order.statusTimestamps?.confirmedAt ?? order.confirmedAt ?? order.createdAt ?? new Date()
}

/** Registra en el ledger la diferencia entre la orden y lo ya registrado. */
export async function syncOrderConsumption(order: OrderLike): Promise<SyncResult> {
  const tenantId = String(order.tenantId)
  if (!order.locationId) return { skipped: 'no_location', events: 0, unmappedLines: 0 }
  if (!(await tenantHasInventory(tenantId))) return { skipped: 'no_inventory', events: 0, unmappedLines: 0 }
  const storage = await consumptionStorageFor(tenantId, String(order.locationId))
  if (!storage) return { skipped: 'no_inventory', events: 0, unmappedLines: 0 }

  const orderId = String(order._id)
  const tenantObjectId = new mongoose.Types.ObjectId(tenantId)
  const consumes = orderConsumes(order.status)

  // Líneas deseadas (las de reward/promo sin plato no consumen insumos).
  const desired: Array<DesiredSaleLine & { modifiers: SelectedModifier[] }> = []
  for (const item of order.items ?? []) {
    if (!item._id) continue
    const menuItemId = item.menuItemId ? String(item.menuItemId) : null
    const modifiers = flattenModifiers(item.customizations as never)
    desired.push({
      lineId: String(item._id),
      menuItemId,
      name: item.name,
      variantName: item.selectedVariant?.name ?? null,
      modifierLabels: modifiers.map(modifierLabel),
      modifiers,
      portions: consumes ? Math.max(0, Math.floor(item.quantity)) : 0,
    })
  }

  const recordedEvents = await InventoryLedger.find({ tenantId: tenantObjectId, correlationId: orderId, eventType: 'SaleRecorded' })
    .select('payload')
    .lean()
  const recorded = summarizeRecorded(recordedEvents as never)
  const corrections = planSaleCorrections(desired, recorded, order.status === 'cancelled')
  if (corrections.length === 0) return { events: 0, unmappedLines: 0 }

  // Recetas vigentes y reglas de modificadores (una consulta por tipo).
  const needsRecipes = corrections.filter((c) => c.kind === 'consume')
  const keys = new Set<string>()
  for (const c of needsRecipes) {
    if (!c.line.menuItemId) continue
    keys.add(dishRecipeKey(String(order.locationId), c.line.menuItemId, c.line.variantName))
    keys.add(dishRecipeKey(String(order.locationId), c.line.menuItemId, null))
  }
  const recipes = keys.size
    ? await InventoryRecipe.find({ tenantId: tenantObjectId, recipeKey: { $in: [...keys] }, isCurrent: true }).lean()
    : []
  const rules = needsRecipes.length ? await InventoryModifierRule.find({ tenantId: tenantObjectId, isActive: true }).lean() : []
  const recipeByKey = new Map(recipes.map((r) => [r.recipeKey, r]))
  const skuIds = new Set<string>()
  for (const r of recipes) for (const i of r.items) skuIds.add(String(i.skuId))
  for (const r of rules) for (const i of r.items) skuIds.add(String(i.skuId))
  const skuDocs = skuIds.size
    ? await InventorySKU.find({ tenantId: tenantObjectId, _id: { $in: [...skuIds] }, isActive: true }).select('name canonicalUnit').lean()
    : []
  const skus = new Map<string, SkuUnitInfo>(skuDocs.map((s) => [String(s._id), { canonicalUnit: s.canonicalUnit, name: s.name }]))
  const ruleList = rules.map((r) => ({
    optionName: r.optionName,
    groupName: r.groupName,
    items: r.items.map((i) => ({ skuId: String(i.skuId), quantity: i.quantity, unit: i.unit })),
  }))

  const now = new Date()
  const source = order.posId || order.source === 'pos' ? 'pos' : 'online'
  let unmappedLines = 0
  const events: NewLedgerEvent[] = corrections.map((c) => {
    const base = {
      eventId: saleEventId(orderId, c.lineId, c.sequence),
      tenantId: tenantObjectId,
      locationId: storage.locationId,
      eventType: 'SaleRecorded' as const,
      // La venta original ocurre al confirmar; las correcciones, ahora.
      occurredAt: c.reason === 'sold' ? confirmedAtOf(order) : now,
      source: source as 'pos' | 'online',
      actorId: null,
      correlationId: orderId,
    }
    const common = {
      orderId,
      orderNumber: order.orderNumber ?? null,
      lineId: c.lineId,
      menuItemId: c.line.menuItemId,
      name: c.line.name,
      variantName: c.line.variantName ?? null,
      modifiers: c.line.modifierLabels,
      portions: c.portions,
      reason: c.reason,
      locationId: String(order.locationId),
    }
    if (c.kind === 'revert') {
      return { ...base, payload: { ...common, recipeId: null, recipeVersion: null, consumption: c.consumption, unmapped: false, warnings: [] } }
    }
    const line = desired.find((d) => d.lineId === c.lineId)!
    // Receta de la variante; si la variante no tiene propia, la base del plato.
    // Usar la base para "Triple" casi seguro subestima el consumo: se marca
    // (baseRecipeFallback + warning) para que la UI lo pida configurar.
    const variantRecipe = c.line.menuItemId && c.line.variantName
      ? recipeByKey.get(dishRecipeKey(String(order.locationId), c.line.menuItemId, c.line.variantName)) ?? null
      : null
    const baseRecipe = c.line.menuItemId
      ? recipeByKey.get(dishRecipeKey(String(order.locationId), c.line.menuItemId, null)) ?? null
      : null
    const recipe = variantRecipe ?? baseRecipe
    const baseRecipeFallback = Boolean(c.line.variantName && !variantRecipe && baseRecipe)
    const exploded = explodeSaleLine({
      portions: c.portions,
      recipe: recipe ? { id: String(recipe._id), version: recipe.version, items: recipe.items.map((i) => ({ skuId: String(i.skuId), quantity: i.quantity, unit: i.unit })) } : null,
      modifiers: line.modifiers,
      rules: ruleList,
      skus,
      storageLocationId: String(storage._id),
    })
    if (exploded.unmapped) unmappedLines++
    return {
      ...base,
      payload: {
        ...common,
        recipeId: recipe ? String(recipe._id) : null,
        recipeVersion: recipe?.version ?? null,
        consumption: exploded.consumption,
        unmapped: exploded.unmapped,
        baseRecipeFallback,
        warnings: baseRecipeFallback
          ? [`La variante "${c.line.variantName}" no tiene receta propia: se descontó la receta base`, ...exploded.warnings]
          : exploded.warnings,
      },
    }
  })

  const res = await appendEvents(events)
  return { events: res.inserted, unmappedLines }
}

/**
 * Para hooks: espera el registro pero NUNCA lanza (una falla de inventario no
 * puede frenar una venta). En serverless hay que esperarlo: una promesa
 * suelta puede cortarse al responder. Lo que falle lo corrige el cron.
 */
export async function syncOrderConsumptionSafe(order: OrderLike): Promise<void> {
  try {
    await syncOrderConsumption(order)
  } catch (err) {
    console.error('[inventory] syncOrderConsumption falló (lo corrige el cron):', String(order._id), err)
  }
}

/** Igual que la anterior pero cargando la orden por id. */
export async function syncOrderConsumptionById(orderId: unknown): Promise<SyncResult | null> {
  const order = await Order.findById(orderId).lean<OrderLike>()
  return order ? syncOrderConsumption(order) : null
}

/**
 * Red de seguridad: reconcilia las órdenes tocadas en las últimas `hours`
 * horas de los tenants con inventario. Idempotente.
 */
export async function reconcileRecentOrders(opts: { tenantId?: string; hours?: number } = {}) {
  const since = new Date(Date.now() - (opts.hours ?? 36) * 3_600_000)
  const filter: Record<string, unknown> = {
    updatedAt: { $gte: since },
    'statusTimestamps.confirmedAt': { $ne: null },
  }
  if (opts.tenantId) filter.tenantId = new mongoose.Types.ObjectId(opts.tenantId)
  const cursor = Order.find(filter).select('tenantId locationId orderNumber status posId source statusTimestamps createdAt items').lean<OrderLike[]>().cursor()
  let orders = 0
  let events = 0
  let unmapped = 0
  for await (const order of cursor) {
    orders++
    try {
      const r = await syncOrderConsumption(order as unknown as OrderLike)
      events += r.events
      unmapped += r.unmappedLines
    } catch (err) {
      console.error('[inventory] reconcile: orden', String((order as OrderLike)._id), err)
    }
  }
  return { orders, events, unmappedLines: unmapped }
}

/** Ventas sin receta (por plato) en un período: lo que falta configurar. */
export async function unmappedSalesSummary(tenantId: mongoose.Types.ObjectId, locationIds: string[] | null, since: Date) {
  const match: Record<string, unknown> = { tenantId, eventType: 'SaleRecorded', 'payload.unmapped': true, occurredAt: { $gte: since } }
  if (locationIds) match.locationId = { $in: locationIds.map((id) => new mongoose.Types.ObjectId(id)) }
  return InventoryLedger.aggregate<{ _id: { menuItemId: string | null; name: string }; portions: number }>([
    { $match: match },
    { $group: { _id: { menuItemId: '$payload.menuItemId', name: '$payload.name' }, portions: { $sum: '$payload.portions' } } },
    { $match: { portions: { $gt: 0 } } },
    { $sort: { portions: -1 } },
    { $limit: 50 },
  ])
}

