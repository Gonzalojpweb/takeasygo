import mongoose from 'mongoose'
import Menu from '@/models/Menu'
import InventoryRecipe from '@/models/InventoryRecipe'
import InventorySKU from '@/models/InventorySKU'
import InventoryState from '@/models/InventoryState'
import { explodeSaleLine, type SkuUnitInfo } from '@takeasygo/business/inventory'
import type { SaleConsumptionLine } from '@takeasygo/types'
import { logAudit } from '@/lib/audit'
import { consumptionStorageFor } from './catalog'

// ============================================================================
// Inventario → carta (POS y SaaS): disponibilidad por stock (Fase J, 2026-10)
// ============================================================================
// Pedido 24/10: «se pausa automáticamente cuando no hay» y el POS lo muestra
// como «Sin inventario». Antes la comunicación era de un solo sentido: el POS
// descontaba insumos pero el inventario nunca avisaba nada.
//
// Cada vez que el inventario proyecta movimientos (venta, merma, recepción,
// conteo, ajuste…) se recalcula, para los platos cuya receta usa esos
// insumos, cuántas PORCIONES alcanzan con el stock de la sede:
//   · porciones < 1  → el plato se pausa solo (pausedReason «stock»), salvo
//                       que ya esté pausado a mano.
//   · porciones ≥ 1  → si estaba pausado POR STOCK, se reanuda solo. Una pausa
//                       manual nunca se levanta automáticamente.
//   · stockPortions  → queda guardado en el ítem: el POS muestra «Quedan N».
// SEGURIDAD: si algún insumo del plato nunca se contó (estado no anclado), el
// stock es DESCONOCIDO y no se toca la disponibilidad — un comercio que recién
// arranca con inventario no ve toda su carta pausada.
// Nunca lanza hacia el llamador (no puede frenar una venta).
// ============================================================================

export const LOW_STOCK_PORTIONS = 5

export interface StockState { mu: number; anchored: boolean }

/**
 * Porciones enteras que alcanzan con el stock. null = desconocido (algún
 * insumo sin estado anclado) o receta sin consumo.
 */
export function portionsFromStock(consumption: SaleConsumptionLine[], states: Map<string, StockState>): number | null {
  if (consumption.length === 0) return null
  let min = Infinity
  for (const line of consumption) {
    if (line.quantity <= 0) continue
    const state = states.get(`${line.skuId}|${line.storageLocationId}`)
    if (!state || !state.anchored) return null
    min = Math.min(min, Math.floor(Math.max(0, state.mu) / line.quantity + 1e-9))
  }
  return Number.isFinite(min) ? min : null
}

type MenuItemDoc = { _id: unknown; name: string; isAvailable?: boolean; pausedReason?: string | null; pausedAt?: Date | null; pausedBy?: string | null; stockPortions?: number | null }

function eachItem(menu: { categories?: { items?: MenuItemDoc[]; subcategories?: { items?: MenuItemDoc[] }[] }[] }, fn: (item: MenuItemDoc) => void) {
  for (const cat of menu.categories ?? []) {
    for (const item of cat.items ?? []) fn(item)
    for (const sub of cat.subcategories ?? []) for (const item of sub.items ?? []) fn(item)
  }
}

/**
 * Recalcula la disponibilidad de los platos que usan `skuIds` en cada sede.
 * Devuelve los cambios aplicados (para auditoría y tests).
 */
export async function syncDishAvailability(
  tenantId: string,
  skuIds: string[]
): Promise<{ menuItemId: string; locationId: string; action: 'paused' | 'resumed' | 'portions'; portions: number | null }[]> {
  if (skuIds.length === 0) return []
  const tid = new mongoose.Types.ObjectId(tenantId)
  const recipes = await InventoryRecipe.find({
    tenantId: tid,
    kind: 'dish',
    isCurrent: true,
    removedAt: null,
    menuItemId: { $ne: null },
    variantName: null,
    locationId: { $ne: null },
    'items.skuId': { $in: skuIds.map((s) => new mongoose.Types.ObjectId(s)) },
  })
    .select('_id locationId menuItemId items version')
    .lean<{ _id: mongoose.Types.ObjectId; locationId: mongoose.Types.ObjectId; menuItemId: string; version: number; items: { skuId: mongoose.Types.ObjectId; quantity: number; unit: string }[] }[]>()
  if (recipes.length === 0) return []

  const allSku = new Set<string>()
  for (const r of recipes) for (const i of r.items) allSku.add(String(i.skuId))
  const skuDocs = await InventorySKU.find({ tenantId: tid, _id: { $in: [...allSku] }, isActive: true }).select('name canonicalUnit').lean<{ _id: unknown; name: string; canonicalUnit: string }[]>()
  const skus = new Map<string, SkuUnitInfo>(skuDocs.map((s) => [String(s._id), { canonicalUnit: s.canonicalUnit as SkuUnitInfo['canonicalUnit'], name: s.name }]))

  const changes: Awaited<ReturnType<typeof syncDishAvailability>> = []
  const byLocation = new Map<string, typeof recipes>()
  for (const r of recipes) {
    const key = String(r.locationId)
    byLocation.set(key, [...(byLocation.get(key) ?? []), r])
  }

  for (const [locationId, list] of byLocation) {
    const storage = await consumptionStorageFor(tid, locationId)
    if (!storage) continue
    const stateDocs = await InventoryState.find({ tenantId: tid, storageLocationId: storage._id, skuId: { $in: [...allSku] } })
      .select('skuId storageLocationId mu anchored')
      .lean<{ skuId: unknown; storageLocationId: unknown; mu: number; anchored: boolean }[]>()
    const states = new Map(stateDocs.map((s) => [`${s.skuId}|${s.storageLocationId}`, { mu: s.mu, anchored: s.anchored }]))

    const portionsByItem = new Map<string, number | null>()
    for (const r of list) {
      const { consumption } = explodeSaleLine({
        portions: 1,
        recipe: { id: String(r._id), version: r.version, items: r.items.map((i) => ({ skuId: String(i.skuId), quantity: i.quantity, unit: i.unit as never })) },
        modifiers: [],
        rules: [],
        skus,
        storageLocationId: String(storage._id),
      })
      portionsByItem.set(r.menuItemId, portionsFromStock(consumption, states))
    }

    const menus = await Menu.find({ tenantId: tid, locationId })
    for (const menu of menus) {
      let dirty = false
      eachItem(menu as never, (item) => {
        const id = String(item._id)
        if (!portionsByItem.has(id)) return
        const portions = portionsByItem.get(id) ?? null
        if (portions === null) return // stock desconocido: no se toca
        if ((item.stockPortions ?? null) !== portions) { item.stockPortions = portions; dirty = true }
        const available = item.isAvailable !== false
        if (portions < 1 && available) {
          item.isAvailable = false
          item.pausedReason = 'stock'
          item.pausedAt = new Date()
          item.pausedBy = 'inventory'
          dirty = true
          changes.push({ menuItemId: id, locationId, action: 'paused', portions })
        } else if (portions >= 1 && !available && item.pausedReason === 'stock') {
          item.isAvailable = true
          item.pausedReason = null
          item.pausedAt = null
          item.pausedBy = null
          dirty = true
          changes.push({ menuItemId: id, locationId, action: 'resumed', portions })
        }
      })
      if (dirty) {
        menu.markModified('categories')
        await menu.save()
      }
    }
  }

  for (const c of changes) {
    await logAudit({
      tenantId,
      action: c.action === 'paused' ? 'menu.item.autopause' : 'menu.item.autoresume',
      entity: 'MenuItem',
      entityId: c.menuItemId,
      details: { locationId: c.locationId, portions: c.portions, source: 'inventory' },
      userId: 'inventory',
      userName: 'Inventario (automático)',
    })
  }
  return changes
}

/** Para el proyector: nunca lanza (una falla acá no frena el inventario ni la venta). */
export async function syncDishAvailabilitySafe(tenantId: string, skuIds: string[]): Promise<void> {
  try {
    await syncDishAvailability(tenantId, skuIds)
  } catch (err) {
    console.error('[inventory] syncDishAvailability falló:', tenantId, err)
  }
}
