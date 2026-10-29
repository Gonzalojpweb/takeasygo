import mongoose from 'mongoose'
import InventoryLedger from '@/models/InventoryLedger'
import InventoryState from '@/models/InventoryState'
import InventorySKU from '@/models/InventorySKU'

// ============================================================================
// Costo de lo vendido — ventas ⇄ inventario (2026-10-25)
// ============================================================================
// Cada venta deja en el ledger su consumo real (SaleRecorded, un evento por
// línea: plato, porciones e insumos en unidad canónica; las correcciones y
// anulaciones restan con cantidades negativas). Acá se valoriza ese consumo:
//   costo = Σ cantidad × costo unitario del insumo en la sede
//   (promedio del depósito; si no hay, el último precio de compra).
// De ahí: CMV del período, margen bruto, food cost %, costo por venta y por
// plato. Cobertura = porciones vendidas con receta / porciones vendidas: un
// plato sin receta no tiene costo y se informa aparte (nunca se inventa).
// Sin inventario activo en la sede (no hay eventos) ⇒ available: false.
// ============================================================================

export interface SalesCost {
  available: boolean
  /** @storedAs cents */
  cmvCents: number
  byOrder: Map<string, number>
  byProduct: Map<string, { portions: number; costCents: number }>
  coverage: { mappedPortions: number; totalPortions: number }
  unmappedProducts: { name: string; portions: number }[]
  /** Insumos consumidos sin ningún costo cargado (compras sin precio). */
  missingCostSkus: number
}

interface LedgerSale {
  correlationId: string | null
  payload: {
    name?: string
    portions?: number
    unmapped?: boolean
    consumption?: { skuId: string; quantity: number }[]
  }
}

const CHUNK = 2000

export function emptySalesCost(): SalesCost {
  return { available: false, cmvCents: 0, byOrder: new Map(), byProduct: new Map(), coverage: { mappedPortions: 0, totalPortions: 0 }, unmappedProducts: [], missingCostSkus: 0 }
}

/** Cálculo puro (testeable): eventos + costo unitario por insumo. */
export function computeSalesCost(events: LedgerSale[], unitCost: Map<string, number>): SalesCost {
  if (events.length === 0) return emptySalesCost()
  const out = emptySalesCost()
  out.available = true
  const unmapped = new Map<string, number>()
  const missing = new Set<string>()
  let cmv = 0
  for (const ev of events) {
    const p = ev.payload ?? {}
    const portions = p.portions ?? 0
    const name = p.name || 'Sin nombre'
    out.coverage.totalPortions += portions
    if (p.unmapped) {
      unmapped.set(name, (unmapped.get(name) ?? 0) + portions)
      continue
    }
    out.coverage.mappedPortions += portions
    let cost = 0
    for (const c of p.consumption ?? []) {
      const u = unitCost.get(String(c.skuId)) ?? 0
      if (!u && c.quantity > 0) missing.add(String(c.skuId))
      cost += c.quantity * u
    }
    cmv += cost
    if (ev.correlationId) out.byOrder.set(ev.correlationId, (out.byOrder.get(ev.correlationId) ?? 0) + cost)
    const prod = out.byProduct.get(name) ?? { portions: 0, costCents: 0 }
    prod.portions += portions
    prod.costCents += cost
    out.byProduct.set(name, prod)
  }
  out.cmvCents = Math.round(cmv)
  for (const [k, v] of out.byOrder) out.byOrder.set(k, Math.round(v))
  for (const v of out.byProduct.values()) v.costCents = Math.round(v.costCents)
  out.unmappedProducts = [...unmapped.entries()].filter(([, n]) => n > 0).map(([name, portions]) => ({ name, portions })).sort((a, b) => b.portions - a.portions).slice(0, 10)
  out.missingCostSkus = missing.size
  return out
}

/** Carga el consumo de esas ventas y lo valoriza con los costos de la sede. */
export async function loadSalesCost(tenantId: string, locationId: string, orderIds: string[]): Promise<SalesCost> {
  if (orderIds.length === 0) return emptySalesCost()
  const tid = new mongoose.Types.ObjectId(tenantId)
  const lid = new mongoose.Types.ObjectId(locationId)
  const events: LedgerSale[] = []
  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const chunk = orderIds.slice(i, i + CHUNK)
    events.push(...await InventoryLedger.find({ tenantId: tid, locationId: lid, eventType: 'SaleRecorded', correlationId: { $in: chunk } })
      .select('correlationId payload.name payload.portions payload.unmapped payload.consumption')
      .lean<LedgerSale[]>())
  }
  if (events.length === 0) return emptySalesCost()

  const skuIds = [...new Set(events.flatMap((e) => (e.payload?.consumption ?? []).map((c) => String(c.skuId))))]
    .filter((id) => mongoose.isValidObjectId(id))
  const [states, skus] = await Promise.all([
    InventoryState.find({ tenantId: tid, locationId: lid, skuId: { $in: skuIds } }).select('skuId avgUnitCostCents').lean<{ skuId: unknown; avgUnitCostCents?: number }[]>(),
    InventorySKU.find({ tenantId: tid, _id: { $in: skuIds } }).select('lastUnitCostCents').lean<{ _id: unknown; lastUnitCostCents?: number }[]>(),
  ])
  const unitCost = new Map<string, number>()
  for (const s of skus) if (s.lastUnitCostCents) unitCost.set(String(s._id), s.lastUnitCostCents)
  for (const s of states) if ((s.avgUnitCostCents ?? 0) > 0) unitCost.set(String(s.skuId), s.avgUnitCostCents!)
  return computeSalesCost(events, unitCost)
}
