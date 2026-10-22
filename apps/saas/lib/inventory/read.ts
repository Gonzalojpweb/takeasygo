// ============================================================================
// Lecturas de inventario: stock, verificaciones, historial, recetas, costos
// ============================================================================
// Todas las lecturas proyectan la creencia hasta "ahora" (beliefAt) sin
// escribir: la incertidumbre de un insumo que no se toca sigue creciendo.
// Siempre filtradas por tenant y por las sedes del alcance del usuario.
// ============================================================================

import mongoose from 'mongoose'
import InventoryState from '@/models/InventoryState'
import InventorySKU from '@/models/InventorySKU'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import InventoryLedger from '@/models/InventoryLedger'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import Order from '@/models/Order'
import {
  beliefAt,
  CONSUMING_ORDER_STATUSES,
  computePriority,
  confidenceLevelOf,
  normalizeName,
  resolveDishRecipe,
  convertQuantity,
  isInventoryUnit,
  selectVerifications,
  stockAlertOf,
  unitCostOf,
  type InventoryUnit,
  type PriorityInput,
} from '@takeasygo/business/inventory'
import type { InventoryBelief } from '@takeasygo/types'
import { getLocalDayAndMinutes, DEFAULT_TIMEZONE } from '@/lib/restaurant-time'
import { beliefParamsForLocation, stateFromDoc } from './projector'
import { dishRecipeKey, loadCurrentRecipes, type CurrentRecipe } from './catalog'
import { InventoryError, type InventoryContext } from './route'

export interface StockRow {
  skuId: string
  storageLocationId: string
  storageName: string
  locationId: string
  name: string
  category: string
  unit: string
  kind: string
  businessImpact: string
  parLevel: number | null
  belief: InventoryBelief
  confidence: ReturnType<typeof confidenceLevelOf>
  stockAlert: ReturnType<typeof stockAlertOf>
  coverageDays: number | null
  unitCostCents: number
  /** Valor estimado del stock (μ × costo promedio). @storedAs cents */
  valueCents: number
}

/** Sedes a mostrar: la pedida (validada) o las del alcance. */
function locationIdsFor(ctx: InventoryContext, requested: string | null): mongoose.Types.ObjectId[] | null {
  if (requested) {
    if (!mongoose.Types.ObjectId.isValid(requested)) throw InventoryError.validation('locationId inválido')
    ctx.assertLocation(requested)
    return [new mongoose.Types.ObjectId(requested)]
  }
  return ctx.scopedLocationIds ? ctx.scopedLocationIds.map((id) => new mongoose.Types.ObjectId(id)) : null
}

export async function loadStock(ctx: InventoryContext, requestedLocationId: string | null, now = Date.now()) {
  const locIds = locationIdsFor(ctx, requestedLocationId)
  const locFilter = locIds ? { locationId: { $in: locIds } } : {}
  const [states, storages, skus] = await Promise.all([
    InventoryState.find({ tenantId: ctx.tenantObjectId, ...locFilter }).lean(),
    InventoryStorageLocation.find({ tenantId: ctx.tenantObjectId, ...locFilter }).select('name locationId isActive isDefaultConsumption type').lean(),
    InventorySKU.find({ tenantId: ctx.tenantObjectId }).lean(),
  ])
  const storageById = new Map(storages.map((s) => [String(s._id), s]))
  const skuById = new Map(skus.map((s) => [String(s._id), s]))
  const paramsByLocation = new Map<string, Awaited<ReturnType<typeof beliefParamsForLocation>>>()

  const rows: StockRow[] = []
  for (const st of states) {
    const sku = skuById.get(String(st.skuId))
    const storage = storageById.get(String(st.storageLocationId))
    if (!sku || !storage || !sku.isActive) continue
    const lid = String(st.locationId)
    if (!paramsByLocation.has(lid)) paramsByLocation.set(lid, await beliefParamsForLocation(lid))
    const belief = beliefAt(stateFromDoc(st as unknown as Record<string, unknown>), now, paramsByLocation.get(lid))
    const unitCostCents = unitCostOf({ belief, referenceUnitCostCents: sku.lastUnitCostCents })
    rows.push({
      skuId: String(sku._id),
      storageLocationId: String(storage._id),
      storageName: storage.name,
      locationId: lid,
      name: sku.name,
      category: sku.category,
      unit: sku.canonicalUnit,
      kind: sku.kind,
      businessImpact: sku.businessImpact,
      parLevel: sku.parLevel,
      belief,
      confidence: confidenceLevelOf(belief),
      stockAlert: stockAlertOf(belief, sku.parLevel),
      coverageDays: belief.anchored && belief.dailyUsage > 0 ? Math.round((belief.mu / belief.dailyUsage) * 10) / 10 : null,
      unitCostCents,
      valueCents: Math.round(Math.max(belief.mu, 0) * unitCostCents),
    })
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, 'es'))

  // Insumos activos sin estado todavía (nunca se movieron): también se listan,
  // para que el conteo inicial los cubra.
  const withState = new Set(rows.map((r) => r.skuId))
  const untouched = skus
    .filter((s) => s.isActive && !withState.has(String(s._id)))
    .map((s) => ({ skuId: String(s._id), name: s.name, unit: s.canonicalUnit, category: s.category, kind: s.kind }))

  return { rows, untouched, storages: storages.filter((s) => s.isActive) }
}

async function localHourFor(ctx: InventoryContext, locIds: mongoose.Types.ObjectId[] | null): Promise<number> {
  const loc = await Location.findOne({ tenantId: ctx.tenantObjectId, ...(locIds ? { _id: { $in: locIds } } : {}) })
    .select('timezone')
    .lean<{ timezone?: string }>()
  return Math.floor(getLocalDayAndMinutes(new Date(), loc?.timezone || DEFAULT_TIMEZONE).minutes / 60)
}

function toPriorityInput(r: StockRow): PriorityInput {
  return {
    skuId: r.skuId,
    storageLocationId: r.storageLocationId,
    name: r.name,
    unit: r.unit,
    businessImpact: r.businessImpact as PriorityInput['businessImpact'],
    parLevel: r.parLevel,
    referenceUnitCostCents: r.unitCostCents,
    belief: r.belief,
  }
}

/** Panel "Hoy": verificaciones que valen la pena, alertas y resumen. */
export async function loadToday(ctx: InventoryContext, requestedLocationId: string | null) {
  const { rows, untouched, storages } = await loadStock(ctx, requestedLocationId)
  const hour = await localHourFor(ctx, locationIdsFor(ctx, requestedLocationId))
  const verifications = selectVerifications(rows.map(toPriorityInput), hour).map((p) => {
    const row = rows.find((r) => r.skuId === p.skuId && r.storageLocationId === p.storageLocationId)!
    return { ...p, storageName: row.storageName, mu: row.belief.mu, sigma: row.belief.sigma, anchored: row.belief.anchored }
  })
  const alerts = rows
    .filter((r) => r.stockAlert || r.belief.flags.includes('negative_estimate'))
    .map((r) => ({
      skuId: r.skuId,
      storageLocationId: r.storageLocationId,
      storageName: r.storageName,
      name: r.name,
      unit: r.unit,
      mu: r.belief.mu,
      sigma: r.belief.sigma,
      stockAlert: r.stockAlert,
      negative: r.belief.flags.includes('negative_estimate'),
      coverageDays: r.coverageDays,
      parLevel: r.parLevel,
    }))
  return {
    localHour: hour,
    verifications,
    alerts,
    totals: {
      skus: rows.length + untouched.length,
      neverCounted: rows.filter((r) => !r.belief.anchored).length + untouched.length,
      stockValueCents: rows.reduce((s, r) => s + r.valueCents, 0),
    },
    untouched,
    storages: storages.map((s) => ({ id: String(s._id), name: s.name, locationId: String(s.locationId), isDefaultConsumption: s.isDefaultConsumption })),
  }
}

/**
 * "Hoy" sin montos en pesos, para roles sin `read`: conservan qué contar y
 * por qué (los motivos son texto operativo), no cuánto vale.
 */
export function stripTodayValues(data: Awaited<ReturnType<typeof loadToday>>) {
  return {
    ...data,
    verifications: data.verifications.map((v) => {
      // Algunos motivos citan montos ("la incertidumbre equivale a $…").
      const safe = v.reasons.filter((r) => !r.includes('$'))
      return {
        skuId: v.skuId,
        storageLocationId: v.storageLocationId,
        storageName: v.storageName,
        name: v.name,
        unit: v.unit,
        mu: v.mu,
        sigma: v.sigma,
        anchored: v.anchored,
        stockoutProbability: v.stockoutProbability,
        coverageDays: v.coverageDays,
        stockAlert: v.stockAlert,
        reasons: safe.length > 0 ? safe : ['Conviene verificarlo hoy'],
      }
    }),
    totals: { skus: data.totals.skus, neverCounted: data.totals.neverCounted },
  }
}

/** Priorización completa (para depurar/explicar por qué se pide o no). */
export async function loadPriorityDebug(ctx: InventoryContext, requestedLocationId: string | null) {
  const { rows } = await loadStock(ctx, requestedLocationId)
  const hour = await localHourFor(ctx, locationIdsFor(ctx, requestedLocationId))
  return rows.map((r) => computePriority(toPriorityInput(r), hour)).sort((a, b) => b.scoreCents - a.scoreCents)
}

// ── Historial de un insumo ───────────────────────────────────────────────────

export async function loadHistory(ctx: InventoryContext, skuId: string, opts: { storageLocationId?: string | null; limit: number; before?: string | null }) {
  if (!mongoose.Types.ObjectId.isValid(skuId)) throw InventoryError.validation('skuId inválido')
  const locIds = locationIdsFor(ctx, null)
  const time = opts.before ? { occurredAt: { $lt: new Date(opts.before) } } : {}
  const storageMatch = opts.storageLocationId && mongoose.Types.ObjectId.isValid(opts.storageLocationId) ? opts.storageLocationId : null
  const filter = {
    tenantId: ctx.tenantObjectId,
    ...(locIds ? { locationId: { $in: locIds } } : {}),
    ...time,
    $or: [
      { skuId: new mongoose.Types.ObjectId(skuId), ...(storageMatch ? { storageLocationId: new mongoose.Types.ObjectId(storageMatch) } : {}) },
      {
        eventType: 'SaleRecorded',
        'payload.consumption': { $elemMatch: { skuId, ...(storageMatch ? { storageLocationId: storageMatch } : {}) } },
      },
    ],
  }
  const events = await InventoryLedger.find(filter).sort({ occurredAt: -1, _id: -1 }).limit(Math.min(opts.limit, 200)).lean()
  return events.map((e) => {
    const p = e.payload ?? {}
    let quantity: number | null = null
    if (e.eventType === 'SaleRecorded') {
      const line = (p.consumption ?? []).find((c: { skuId: string }) => c.skuId === skuId)
      quantity = line ? -line.quantity : 0
    } else if (e.eventType === 'GoodsReceived' || e.eventType === 'TransferIn') quantity = p.quantity
    else if (e.eventType === 'WasteRecorded' || e.eventType === 'TransferOut') quantity = -p.quantity
    else if (e.eventType === 'ProductionTransformed') quantity = p.direction === 'output' ? p.quantity : -p.quantity
    else if (e.eventType === 'AdjustmentApplied') quantity = p.delta
    return {
      id: String(e._id),
      eventType: e.eventType,
      occurredAt: e.occurredAt,
      recordedAt: e.recordedAt,
      source: e.source,
      actorId: e.actorId,
      observationMethod: e.observationMethod,
      quantity,
      observed: e.eventType === 'PhysicalCountObserved' ? p.observedQuantity : null,
      detail:
        e.eventType === 'SaleRecorded'
          ? `${p.portions > 0 ? '' : 'Reversión: '}${Math.abs(p.portions)} × ${p.name}${p.variantName ? ` ${p.variantName}` : ''}${p.orderNumber ? ` (pedido ${p.orderNumber})` : ''}${p.variantUsesBase ? ' · igual a la base' : ''}${p.unmappedReason === 'variant_unconfirmed' ? ' · variante sin receta confirmada' : ''}`
          : p.reason ?? p.supplierName ?? p.notes ?? null,
    }
  })
}

// ── Recetas por plato (con cobertura y costo teórico) ────────────────────────

interface MenuItemView {
  menuItemId: string
  name: string
  categoryName: string
  priceCents: number
  variants: Array<{ name: string; priceCents: number }>
  modifiers: string[]
}

function flattenMenu(menu: { categories?: unknown[] } | null): MenuItemView[] {
  const out: MenuItemView[] = []
  const optionNames = (groups: unknown[] | undefined, acc: Set<string>) => {
    for (const g of (groups ?? []) as Array<{ options?: Array<{ name?: string; subGroups?: unknown[] }> }>) {
      for (const o of g.options ?? []) {
        if (o.name) acc.add(o.name)
        optionNames(o.subGroups, acc)
      }
    }
  }
  const pushItems = (items: unknown[] | undefined, categoryName: string, inherited: unknown[]) => {
    for (const it of (items ?? []) as Array<{ _id?: unknown; name: string; price?: number; variants?: Array<{ name: string; price: number; customizationGroups?: unknown[] }>; customizationGroups?: unknown[] }>) {
      if (!it._id) continue
      const mods = new Set<string>()
      optionNames([...inherited, ...(it.customizationGroups ?? [])], mods)
      for (const v of it.variants ?? []) optionNames(v.customizationGroups, mods)
      out.push({
        menuItemId: String(it._id),
        name: it.name,
        categoryName,
        priceCents: it.price ?? 0,
        variants: (it.variants ?? []).map((v) => ({ name: v.name, priceCents: v.price })),
        modifiers: [...mods],
      })
    }
  }
  for (const c of (menu?.categories ?? []) as Array<{ name: string; items?: unknown[]; subcategories?: Array<{ name: string; items?: unknown[]; customizationGroups?: unknown[] }>; customizationGroups?: unknown[] }>) {
    pushItems(c.items, c.name, c.customizationGroups ?? [])
    for (const sub of c.subcategories ?? []) pushItems(sub.items, `${c.name} · ${sub.name}`, [...(c.customizationGroups ?? []), ...(sub.customizationGroups ?? [])])
  }
  return out
}

/** Costo por unidad canónica para costeo teórico: promedio del depósito de consumo o último precio. */
async function costMap(ctx: InventoryContext, locationId: mongoose.Types.ObjectId) {
  const [skus, states] = await Promise.all([
    InventorySKU.find({ tenantId: ctx.tenantObjectId }).select('name canonicalUnit lastUnitCostCents isActive').lean(),
    InventoryState.find({ tenantId: ctx.tenantObjectId, locationId }).select('skuId avgUnitCostCents').lean(),
  ])
  const avg = new Map<string, number>()
  for (const s of states) if (s.avgUnitCostCents > 0) avg.set(String(s.skuId), s.avgUnitCostCents)
  return new Map(skus.map((s) => [String(s._id), { name: s.name, unit: s.canonicalUnit, isActive: s.isActive, costCents: avg.get(String(s._id)) ?? s.lastUnitCostCents }]))
}

export function recipeCostCents(items: Array<{ skuId: unknown; quantity: number; unit: string }>, costs: Map<string, { unit: string; costCents: number }>): { costCents: number; missingCost: number } {
  let total = 0
  let missing = 0
  for (const it of items) {
    const c = costs.get(String(it.skuId))
    if (!c || !isInventoryUnit(it.unit) || !isInventoryUnit(c.unit)) continue
    const q = convertQuantity(it.quantity, it.unit as InventoryUnit, c.unit as InventoryUnit)
    if (q === null) continue
    if (!c.costCents) missing++
    total += q * c.costCents
  }
  return { costCents: Math.round(total), missingCost: missing }
}

/** Porciones vendidas por plato y variante (últimos `days` días) para priorizar. */
async function salesRanking(ctx: InventoryContext, locationId: mongoose.Types.ObjectId, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000)
  const rows = await Order.aggregate<{ _id: { m: unknown; v: string | null }; portions: number }>([
    { $match: { tenantId: ctx.tenantObjectId, locationId, createdAt: { $gte: since }, status: { $in: [...CONSUMING_ORDER_STATUSES] } } },
    { $unwind: '$items' },
    { $match: { 'items.menuItemId': { $ne: null } } },
    { $group: { _id: { m: '$items.menuItemId', v: { $ifNull: ['$items.selectedVariant.name', null] } }, portions: { $sum: '$items.quantity' } } },
  ])
  const byItem = new Map<string, { total: number; byVariant: Map<string, number> }>()
  for (const r of rows) {
    const key = String(r._id.m)
    const cur = byItem.get(key) ?? { total: 0, byVariant: new Map<string, number>() }
    cur.total += r.portions
    if (r._id.v) cur.byVariant.set(normalizeName(r._id.v), (cur.byVariant.get(normalizeName(r._id.v)) ?? 0) + r.portions)
    byItem.set(key, cur)
  }
  return byItem
}

/** Estado de cobertura de un plato, del más al menos resuelto. */
export type DishCoverage = 'controlled' | 'needs_counts' | 'variants_pending' | 'no_recipe'

/**
 * Platos del menú de la sede con su receta vigente, estado de cada variante
 * (D-26), cobertura real, costo teórico, ventas recientes y recetas huérfanas
 * (R9: recetas de platos o variantes que ya no están en el menú).
 */
export async function loadRecipesView(ctx: InventoryContext, locationId: string) {
  if (!mongoose.Types.ObjectId.isValid(locationId)) throw InventoryError.validation('locationId inválido')
  ctx.assertLocation(locationId)
  const locOid = new mongoose.Types.ObjectId(locationId)
  const [menu, recipeMap, preparationMap, costs, ranking, consumption] = await Promise.all([
    Menu.findOne({ tenantId: ctx.tenantObjectId, locationId: locOid }).lean(),
    loadCurrentRecipes(ctx.tenantObjectId, { kind: 'dish', locationId: locOid }),
    loadCurrentRecipes(ctx.tenantObjectId, { kind: 'preparation' }),
    costMap(ctx, locOid),
    salesRanking(ctx, locOid),
    InventoryStorageLocation.findOne({ tenantId: ctx.tenantObjectId, locationId: locOid, isDefaultConsumption: true }).select('_id').lean(),
  ])
  // Insumos con línea base (contados) en el depósito de consumo de la sede.
  const anchored = new Set(
    consumption
      ? (await InventoryState.find({ tenantId: ctx.tenantObjectId, storageLocationId: consumption._id, anchored: true }).select('skuId').lean()).map((s) => String(s.skuId))
      : [],
  )

  const items = flattenMenu(menu as never)
  const recipeView = (r: CurrentRecipe, priceCents: number) => {
    const { costCents, missingCost } = recipeCostCents(r.items, costs)
    return {
      recipeId: String(r._id),
      recipeKey: r.recipeKey,
      variantName: r.variantName,
      version: r.version,
      usesBaseRecipe: Boolean(r.usesBaseRecipe),
      items: r.items.map((i) => ({ skuId: String(i.skuId), quantity: i.quantity, unit: i.unit, skuName: costs.get(String(i.skuId))?.name ?? '—' })),
      costCents,
      missingCost,
      priceCents,
      foodCostPct: priceCents > 0 && costCents > 0 ? Math.round((costCents / priceCents) * 1000) / 10 : null,
    }
  }

  const usedKeys = new Set<string>()
  const view = items.map((it) => {
    const baseKey = dishRecipeKey(locationId, it.menuItemId, null)
    const base = recipeMap.get(baseKey) ?? null
    if (base) usedKeys.add(baseKey)
    const sold = ranking.get(it.menuItemId)
    const effectiveSkus = new Set<string>()
    if (base && !base.usesBaseRecipe) for (const i of base.items) effectiveSkus.add(String(i.skuId))

    const variants = it.variants.map((v) => {
      const key = dishRecipeKey(locationId, it.menuItemId, v.name)
      const own = recipeMap.get(key) ?? null
      if (own) usedKeys.add(key)
      const { status } = resolveDishRecipe({
        variantName: v.name,
        variantRecipe: own ? { id: String(own._id), version: own.version, items: [], usesBaseRecipe: own.usesBaseRecipe } : null,
        baseRecipe: base ? { id: String(base._id), version: base.version, items: [], usesBaseRecipe: base.usesBaseRecipe } : null,
      })
      if (own && !own.usesBaseRecipe) for (const i of own.items) effectiveSkus.add(String(i.skuId))
      return {
        name: v.name,
        priceCents: v.priceCents,
        status,
        soldLast30d: sold?.byVariant.get(normalizeName(v.name)) ?? 0,
        recipe: own ? recipeView(own, v.priceCents) : null,
      }
    })

    const missingCounts = [...effectiveSkus]
      .filter((id) => !anchored.has(id))
      .map((id) => ({ skuId: id, name: costs.get(id)?.name ?? '—' }))
    const pendingVariants = variants.filter((v) => v.status === 'variant_unconfirmed' || v.status === 'no_recipe').length
    const coverage: DishCoverage = !base
      ? 'no_recipe'
      : pendingVariants > 0
        ? 'variants_pending'
        : missingCounts.length > 0
          ? 'needs_counts'
          : 'controlled'

    const baseView = base ? recipeView(base, it.priceCents) : null
    return {
      ...it,
      soldLast30d: sold?.total ?? 0,
      coverage,
      base: baseView,
      variantStates: variants,
      missingCounts,
      // Compatibilidad con la UI clásica.
      recipes: [baseView, ...variants.map((v) => v.recipe)].filter(Boolean),
      hasRecipe: Boolean(base),
    }
  })
  view.sort((a, b) => b.soldLast30d - a.soldLast30d || a.name.localeCompare(b.name, 'es'))

  // R9: recetas vigentes que ya no corresponden a un plato o variante del menú.
  const orphans = [...recipeMap.values()]
    .filter((r) => !usedKeys.has(r.recipeKey))
    .map((r) => ({
      recipeKey: r.recipeKey,
      name: r.name,
      menuItemId: r.menuItemId,
      variantName: r.variantName,
      reason: items.some((i) => i.menuItemId === r.menuItemId) ? ('variant_missing' as const) : ('dish_missing' as const),
    }))

  const count = (c: DishCoverage) => view.filter((v) => v.coverage === c).length
  return {
    items: view,
    coverage: {
      total: view.length,
      withRecipe: view.filter((v) => v.hasRecipe).length,
      controlled: count('controlled'),
      needsCounts: count('needs_counts'),
      variantsPending: count('variants_pending'),
      noRecipe: count('no_recipe'),
    },
    orphans,
    preparations: [...preparationMap.values()].map((p) => ({
      recipeId: String(p._id),
      name: p.name,
      outputSkuId: String(p.outputSkuId),
      outputQuantity: p.outputQuantity,
      version: p.version,
      items: p.items.map((i) => ({ skuId: String(i.skuId), quantity: i.quantity, unit: i.unit, skuName: costs.get(String(i.skuId))?.name ?? '—' })),
      ...recipeCostCents(p.items, costs),
    })),
  }
}

/** Consumo teórico valorizado de un período (costo de mercadería vendida). */
export async function loadConsumptionCost(ctx: InventoryContext, requestedLocationId: string | null, from: Date, to: Date) {
  const locIds = locationIdsFor(ctx, requestedLocationId)
  const match: Record<string, unknown> = { tenantId: ctx.tenantObjectId, eventType: 'SaleRecorded', occurredAt: { $gte: from, $lt: to } }
  if (locIds) match.locationId = { $in: locIds }
  const [bySku, unmapped] = await Promise.all([
    InventoryLedger.aggregate<{ _id: { skuId: string; storageLocationId: string }; quantity: number }>([
      { $match: match },
      { $unwind: '$payload.consumption' },
      { $group: { _id: { skuId: '$payload.consumption.skuId', storageLocationId: '$payload.consumption.storageLocationId' }, quantity: { $sum: '$payload.consumption.quantity' } } },
    ]),
    InventoryLedger.aggregate<{ _id: null; portions: number }>([
      { $match: { ...match, 'payload.unmapped': true } },
      { $group: { _id: null, portions: { $sum: '$payload.portions' } } },
    ]),
  ])
  const states = await InventoryState.find({ tenantId: ctx.tenantObjectId, ...(locIds ? { locationId: { $in: locIds } } : {}) }).select('skuId storageLocationId avgUnitCostCents').lean()
  const skus = await InventorySKU.find({ tenantId: ctx.tenantObjectId }).select('name canonicalUnit lastUnitCostCents').lean()
  const skuById = new Map(skus.map((s) => [String(s._id), s]))
  const avg = new Map(states.map((s) => [`${s.skuId}|${s.storageLocationId}`, s.avgUnitCostCents]))
  const lines = bySku
    .map((g) => {
      const sku = skuById.get(g._id.skuId)
      const cost = avg.get(`${g._id.skuId}|${g._id.storageLocationId}`) || sku?.lastUnitCostCents || 0
      return { skuId: g._id.skuId, name: sku?.name ?? '—', unit: sku?.canonicalUnit ?? '', quantity: Math.round(g.quantity * 1000) / 1000, costCents: Math.round(g.quantity * cost) }
    })
    .filter((l) => l.quantity !== 0)
    .sort((a, b) => b.costCents - a.costCents)
  return { lines, totalCostCents: lines.reduce((s, l) => s + l.costCents, 0), unmappedPortions: unmapped[0]?.portions ?? 0 }
}
