import { useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import type { Order } from "@takeasygo/types"
import { db } from "../db/dexie"

// ============================================================================
// Actividad por mesa — derivada de las órdenes abiertas (read model Dexie)
// ============================================================================
// La Mesa no guarda hora de apertura ni monto: la cuenta es la suma de sus
// órdenes POS abiertas (BDL: "Una Mesa contiene Pedidos"; "Una Mesa posee una
// Cuenta"). Counter v2 §4: la mesa muestra "nombre, estado, tiempo o monto".
// ============================================================================

export interface TableActivity {
  /** Suma de las órdenes abiertas (centavos). */
  total: number
  /** Lo que falta cobrar (órdenes sin posPayments). */
  unpaid: number
  /** Creación de la primera ronda abierta. */
  openedAt: Date
  rounds: number
}

const CLOSED = new Set(["delivered", "cancelled"])

export function summarizeTableActivity(orders: readonly Order[]): Map<string, TableActivity> {
  const map = new Map<string, TableActivity>()
  for (const o of orders) {
    if (o.source !== "pos" || !o.tableId || CLOSED.has(o.status)) continue
    const createdAt = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt)
    const prev = map.get(o.tableId)
    const unpaid = o.payments?.length ? 0 : o.total
    if (!prev) {
      map.set(o.tableId, { total: o.total, unpaid, openedAt: createdAt, rounds: 1 })
    } else {
      prev.total += o.total
      prev.unpaid += unpaid
      prev.rounds += 1
      if (createdAt < prev.openedAt) prev.openedAt = createdAt
    }
  }
  return map
}

export function useTableActivity(tenantId: string | undefined): Map<string, TableActivity> {
  const orders = useLiveQuery(
    () => (tenantId
      ? db.orders
          .where("tenantId")
          .equals(tenantId)
          .and((o) => o.source === "pos" && Boolean(o.tableId) && !CLOSED.has(o.status))
          .toArray()
      : []),
    [tenantId]
  )
  return useMemo(() => summarizeTableActivity(orders ?? []), [orders])
}

/** "35 min", "1 h 05 min". */
export function formatElapsed(from: Date, now: number): string {
  const minutes = Math.max(0, Math.floor((now - from.getTime()) / 60_000))
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  return `${h} h ${String(minutes % 60).padStart(2, "0")} min`
}
