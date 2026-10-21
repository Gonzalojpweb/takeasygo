// ============================================================================
// Ledger → movimientos de un agregado (insumo × depósito)
// ============================================================================
// Traduce cada evento del ledger a los BeliefDelta que le corresponden a UN
// agregado. Un SaleRecorded (un plato) puede tocar varios insumos: acá se
// filtra su `consumption[]` por el agregado pedido.
// ============================================================================

import type { InventoryEventType, ObservationMethod } from "@takeasygo/types"
import type { BeliefDelta, BeliefParams } from "./belief"
import { DEFAULT_BELIEF_PARAMS } from "./belief"

export interface LedgerEventLike {
  eventType: InventoryEventType | string
  occurredAt: Date | string | number
  skuId?: unknown
  storageLocationId?: unknown
  observationMethod?: ObservationMethod | string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any
}

const MEASURED_METHODS = new Set(["connected_scale", "manual_scale"])

function toMs(value: Date | string | number): number {
  return value instanceof Date ? value.getTime() : typeof value === "number" ? value : new Date(value).getTime()
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function costOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null
}

export function deltasForAggregate(
  event: LedgerEventLike,
  skuId: string,
  storageLocationId: string,
  params: BeliefParams = DEFAULT_BELIEF_PARAMS,
): BeliefDelta[] {
  const at = toMs(event.occurredAt)
  const p = event.payload ?? {}

  if (event.eventType === "SaleRecorded") {
    const lines: Array<{ skuId: unknown; storageLocationId: unknown; quantity: unknown }> = Array.isArray(p.consumption) ? p.consumption : []
    const out: BeliefDelta[] = []
    for (const line of lines) {
      if (String(line.skuId) !== skuId || String(line.storageLocationId) !== storageLocationId) continue
      const q = num(line.quantity)
      if (q === 0) continue
      // Una reversión (q < 0) devuelve lo que se descontó: no suma incertidumbre.
      out.push({ kind: "outflow", at, quantity: q, relSigma: q > 0 ? params.theoreticalRelSigma : 0, usage: true })
    }
    return out
  }

  // El resto son eventos de insumo: solo aplican a su propio agregado.
  if (String(event.skuId) !== skuId || String(event.storageLocationId) !== storageLocationId) return []

  switch (event.eventType) {
    case "GoodsReceived":
      return [{ kind: "inflow", at, quantity: num(p.quantity), relSigma: params.receiptRelSigma, unitCostCents: costOrNull(p.unitCostCents) }]
    case "TransferIn":
      return [{ kind: "inflow", at, quantity: num(p.quantity), relSigma: params.recordedRelSigma, unitCostCents: costOrNull(p.unitCostCents) }]
    case "TransferOut":
      return [{ kind: "outflow", at, quantity: num(p.quantity), relSigma: params.recordedRelSigma, usage: false }]
    case "WasteRecorded": {
      const measured = MEASURED_METHODS.has(String(event.observationMethod ?? ""))
      return [{
        kind: "outflow",
        at,
        quantity: num(p.quantity),
        relSigma: measured ? params.wasteMeasuredRelSigma : params.wasteEstimatedRelSigma,
        usage: true,
      }]
    }
    case "ProductionTransformed":
      return p.direction === "output"
        ? [{ kind: "inflow", at, quantity: num(p.quantity), relSigma: params.receiptRelSigma, unitCostCents: costOrNull(p.unitCostCents) }]
        : [{ kind: "outflow", at, quantity: num(p.quantity), relSigma: params.recordedRelSigma, usage: true }]
    case "PhysicalCountObserved": {
      const method = (event.observationMethod ?? "visual_count") as ObservationMethod
      return [{ kind: "count", at, observed: num(p.observedQuantity), method: method in params.measurementRelSigma ? method : "visual_count" }]
    }
    case "AdjustmentApplied":
      return [{ kind: "adjust", at, delta: num(p.delta) }]
    case "EvidenceIgnored":
      return [{ kind: "ignored", at }]
    case "SaleConsumed": // legado v1
      return [{ kind: "outflow", at, quantity: num(p.quantityConsumed), relSigma: params.theoreticalRelSigma, usage: true }]
    default:
      return []
  }
}
