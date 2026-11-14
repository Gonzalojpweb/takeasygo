// ============================================================================
// Guía en vivo — cargador (junta los datos reales de la sede para rules.ts)
// ============================================================================
// Una lectura por apertura de la guía. Todo filtrado por tenant y sede.
// No viaja ningún costo en pesos: solo si el insumo tiene precio o no.
// ============================================================================

import mongoose from 'mongoose'
import Menu from '@/models/Menu'
import InventorySKU from '@/models/InventorySKU'
import InventoryState from '@/models/InventoryState'
import InventoryLedger from '@/models/InventoryLedger'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import { setupStatusByLocation } from '../catalog'
import { loadRecipesView } from '../read'
import { canRoleUse, InventoryError, type InventoryContext } from '../route'
import { buildCoach, convert, type CoachDish, type CoachInput, type CoachUnit } from './rules'

const DAY = 86_400_000
const UNITS = new Set(['kg', 'g', 'l', 'ml', 'unit'])
const asUnit = (u: unknown): CoachUnit => (typeof u === 'string' && UNITS.has(u) ? (u as CoachUnit) : 'unit')

type MenuItemLite = { _id?: unknown; isAvailable?: boolean; pausedReason?: string | null; stockPortions?: number | null }

function menuStates(menu: { categories?: Array<{ items?: MenuItemLite[]; subcategories?: Array<{ items?: MenuItemLite[] }> }> } | null) {
  const out = new Map<string, MenuItemLite>()
  for (const c of menu?.categories ?? []) {
    for (const i of c.items ?? []) if (i._id) out.set(String(i._id), i)
    for (const s of c.subcategories ?? []) for (const i of s.items ?? []) if (i._id) out.set(String(i._id), i)
  }
  return out
}

export async function loadCoachInput(ctx: InventoryContext, locationId: string): Promise<CoachInput> {
  if (!mongoose.Types.ObjectId.isValid(locationId)) throw InventoryError.validation('locationId inválido')
  ctx.assertLocation(locationId)
  const tid = ctx.tenantObjectId
  const locOid = new mongoose.Types.ObjectId(locationId)
  const since14 = new Date(Date.now() - 14 * DAY)
  const since7 = new Date(Date.now() - 7 * DAY)

  const [statusMap, recipes, menu, skuDocs, storage] = await Promise.all([
    setupStatusByLocation(tid, [locOid]),
    loadRecipesView(ctx, locationId),
    Menu.findOne({ tenantId: tid, locationId: locOid }).select('categories').lean(),
    InventorySKU.find({ tenantId: tid }).select('name category canonicalUnit lastUnitCostCents isActive').lean(),
    // También en preparación (consumptionStorageFor solo devuelve sedes activas):
    // la guía tiene que avisar ANTES de activar que una receta no alcanza.
    InventoryStorageLocation.findOne({ tenantId: tid, locationId: locOid, isDefaultConsumption: true, isActive: true }).select('_id').lean<{ _id: mongoose.Types.ObjectId } | null>(),
  ])
  const status = statusMap.get(locationId) ?? 'off'

  const [states, receipts, counts, totals, unmapped] = await Promise.all([
    storage
      ? InventoryState.find({ tenantId: tid, storageLocationId: storage._id }).select('skuId mu anchored').lean<{ skuId: unknown; mu: number; anchored: boolean }[]>()
      : Promise.resolve([] as { skuId: unknown; mu: number; anchored: boolean }[]),
    InventoryLedger.find({ tenantId: tid, locationId: locOid, eventType: 'GoodsReceived', occurredAt: { $gte: since14 } })
      .sort({ occurredAt: -1 })
      .limit(200)
      .select('skuId occurredAt payload.quantity')
      .lean<{ skuId: unknown; occurredAt: Date; payload?: { quantity?: number } }[]>(),
    InventoryLedger.find({ tenantId: tid, locationId: locOid, eventType: 'PhysicalCountObserved', occurredAt: { $gte: since14 } })
      .sort({ occurredAt: -1 })
      .limit(200)
      .select('skuId occurredAt payload.observedQuantity payload.unit payload.expectedAtRecord')
      .lean<{ skuId: unknown; occurredAt: Date; payload?: { observedQuantity?: number; unit?: string; expectedAtRecord?: { mu?: number } | null } }[]>(),
    Promise.all(
      (['GoodsReceived', 'PhysicalCountObserved', 'WasteRecorded'] as const).map((eventType) =>
        InventoryLedger.countDocuments({ tenantId: tid, locationId: locOid, eventType }, { limit: 5 }),
      ),
    ),
    InventoryLedger.aggregate<{ portions: number }>([
      { $match: { tenantId: tid, locationId: locOid, eventType: 'SaleRecorded', 'payload.unmapped': true, occurredAt: { $gte: since7 } } },
      { $group: { _id: null, portions: { $sum: '$payload.portions' } } },
    ]),
  ])

  const stateBySku = new Map<string, { mu: number; anchored: boolean }>(states.map((s) => [String(s.skuId), s] as const))
  const skuUnit = new Map(skuDocs.map((s) => [String(s._id), asUnit(s.canonicalUnit)]))
  const recipeSkuIds = new Set<string>()
  for (const d of recipes.items) for (const i of d.base?.items ?? []) recipeSkuIds.add(i.skuId)

  const pauses = menuStates(menu as never)
  const dishes: CoachDish[] = recipes.items.map((d) => {
    const m = pauses.get(d.menuItemId)
    return {
      menuItemId: d.menuItemId,
      name: d.name,
      soldLast30d: d.soldLast30d,
      coverage: d.coverage,
      pendingVariants: d.variantStates.filter((v) => v.status === 'variant_unconfirmed' || v.status === 'no_recipe').map((v) => v.name),
      recipe: d.base && !d.base.usesBaseRecipe ? d.base.items.map((i) => ({ skuId: i.skuId, skuName: i.skuName, quantity: i.quantity, unit: asUnit(i.unit) })) : null,
      isAvailable: m?.isAvailable !== false,
      pausedReason: m?.pausedReason ?? null,
      stockPortions: m?.stockPortions ?? null,
    }
  })

  return {
    locationName: '',
    status,
    dishes,
    skus: skuDocs.map((s) => {
      const st = stateBySku.get(String(s._id))
      return {
        id: String(s._id),
        name: s.name,
        category: s.category,
        unit: asUnit(s.canonicalUnit),
        hasCost: (s.lastUnitCostCents ?? 0) > 0,
        isActive: s.isActive !== false,
        usedInRecipes: recipeSkuIds.has(String(s._id)),
        stock: st ? { qty: st.mu, counted: st.anchored } : null,
      }
    }),
    receipts: receipts
      .filter((r) => r.skuId && typeof r.payload?.quantity === 'number')
      .map((r) => ({ skuId: String(r.skuId), quantity: r.payload!.quantity!, at: r.occurredAt.toISOString() })),
    counts: counts
      .filter((c) => c.skuId && typeof c.payload?.observedQuantity === 'number')
      .map((c) => {
        const unit = skuUnit.get(String(c.skuId)) ?? 'unit'
        const observed = convert(c.payload!.observedQuantity!, asUnit(c.payload!.unit ?? unit), unit) ?? c.payload!.observedQuantity!
        const mu = c.payload!.expectedAtRecord?.mu
        return { skuId: String(c.skuId), observed, expected: typeof mu === 'number' ? mu : null, at: c.occurredAt.toISOString() }
      }),
    unmappedPortions: unmapped[0]?.portions ?? 0,
    totals: { receipts: totals[0], counts: totals[1], wastes: totals[2] },
    can: {
      recipes: canRoleUse(ctx.user.role, 'recipes'),
      capture: canRoleUse(ctx.user.role, 'capture'),
      manage: canRoleUse(ctx.user.role, 'manage'),
    },
  }
}

export async function loadCoach(ctx: InventoryContext, locationId: string) {
  return buildCoach(await loadCoachInput(ctx, locationId))
}
