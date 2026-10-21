// ============================================================================
// Reconciliación de ventas: orden actual vs. ledger (D-04, D-10)
// ============================================================================
// La venta se registra comparando lo que la orden DICE hoy con lo que el
// ledger YA registró para cada línea, y emitiendo solo la diferencia. Esto
// hace que registrar sea idempotente y que el mismo mecanismo cubra:
//
//   confirmación · rondas agregadas · cantidad cambiada · línea quitada ·
//   pedido cancelado · reintentos · el cron de reconciliación
//
// El eventId de cada corrección es determinístico: sale:{orden}:{línea}:{n},
// con n = cantidad de eventos ya registrados para esa línea. Dos procesos
// que reconcilian a la vez generan el MISMO id → el índice único descarta
// el duplicado.
//
// Las reversiones devuelven exactamente lo que se había descontado (promedio
// por porción de lo registrado), no lo que diría la receta actual.
// ============================================================================

import type { SaleConsumptionLine } from "@takeasygo/types"
import { roundQuantity } from "./units"

/** Estados de orden en los que el plato ya se considera consumido. */
export const CONSUMING_ORDER_STATUSES = ["confirmed", "preparing", "ready", "en_ruta", "arrived", "delivered"] as const

export function orderConsumes(status: string): boolean {
  return (CONSUMING_ORDER_STATUSES as readonly string[]).includes(status)
}

export interface DesiredSaleLine {
  lineId: string
  menuItemId: string | null
  name: string
  variantName: string | null
  modifierLabels: string[]
  /** Porciones que la orden dice HOY que se consumieron (0 si no consume). */
  portions: number
}

export interface RecordedSaleLine {
  lineId: string
  menuItemId: string | null
  name: string
  variantName: string | null
  modifierLabels: string[]
  portions: number
  eventsCount: number
  consumption: SaleConsumptionLine[]
}

export type SaleCorrection =
  | {
      kind: "consume"
      lineId: string
      sequence: number
      portions: number
      reason: "sold" | "quantity_changed"
      line: DesiredSaleLine
    }
  | {
      kind: "revert"
      lineId: string
      sequence: number
      portions: number
      reason: "quantity_changed" | "removed" | "cancelled"
      line: Omit<DesiredSaleLine, "portions">
      consumption: SaleConsumptionLine[]
    }

export function saleEventId(orderId: string, lineId: string, sequence: number): string {
  return `sale:${orderId}:${lineId}:${sequence}`
}

/** Suma eventos ya registrados por línea. */
export function summarizeRecorded(
  events: ReadonlyArray<{ payload: { lineId: string; menuItemId: string | null; name: string; variantName?: string | null; modifiers?: string[]; portions: number; consumption: SaleConsumptionLine[] } }>,
): Map<string, RecordedSaleLine> {
  const map = new Map<string, RecordedSaleLine>()
  for (const ev of events) {
    const p = ev.payload
    const cur =
      map.get(p.lineId) ??
      {
        lineId: p.lineId,
        menuItemId: p.menuItemId ?? null,
        name: p.name,
        variantName: p.variantName ?? null,
        modifierLabels: p.modifiers ?? [],
        portions: 0,
        eventsCount: 0,
        consumption: [],
      }
    cur.portions += p.portions
    cur.eventsCount += 1
    for (const c of p.consumption ?? []) {
      const existing = cur.consumption.find((x) => x.skuId === c.skuId && x.storageLocationId === c.storageLocationId)
      if (existing) existing.quantity = roundQuantity(existing.quantity + c.quantity)
      else cur.consumption.push({ ...c })
    }
    map.set(p.lineId, cur)
  }
  return map
}

export function planSaleCorrections(
  desired: readonly DesiredSaleLine[],
  recorded: ReadonlyMap<string, RecordedSaleLine>,
  orderCancelled: boolean,
): SaleCorrection[] {
  const out: SaleCorrection[] = []
  const seen = new Set<string>()

  for (const line of desired) {
    seen.add(line.lineId)
    const rec = recorded.get(line.lineId)
    const already = rec?.portions ?? 0
    const sequence = rec?.eventsCount ?? 0
    const diff = line.portions - already
    if (diff > 0) {
      out.push({ kind: "consume", lineId: line.lineId, sequence, portions: diff, reason: already === 0 ? "sold" : "quantity_changed", line })
    } else if (diff < 0 && rec) {
      out.push({
        kind: "revert",
        lineId: line.lineId,
        sequence,
        portions: diff,
        reason: line.portions === 0 ? (orderCancelled ? "cancelled" : "removed") : "quantity_changed",
        line,
        consumption: scaleConsumption(rec, -diff),
      })
    }
  }

  // Líneas registradas que ya no están en la orden → se quitaron.
  for (const rec of recorded.values()) {
    if (seen.has(rec.lineId) || rec.portions <= 0) continue
    out.push({
      kind: "revert",
      lineId: rec.lineId,
      sequence: rec.eventsCount,
      portions: -rec.portions,
      reason: orderCancelled ? "cancelled" : "removed",
      line: { lineId: rec.lineId, menuItemId: rec.menuItemId, name: rec.name, variantName: rec.variantName, modifierLabels: rec.modifierLabels },
      consumption: scaleConsumption(rec, rec.portions),
    })
  }
  return out
}

/** Consumo a devolver por `portions` porciones (negativo), proporcional a lo registrado. */
function scaleConsumption(rec: RecordedSaleLine, portions: number): SaleConsumptionLine[] {
  if (rec.portions <= 0) return []
  const factor = portions / rec.portions
  return rec.consumption
    .map((c) => ({ ...c, quantity: roundQuantity(-c.quantity * factor) }))
    .filter((c) => c.quantity !== 0)
}
