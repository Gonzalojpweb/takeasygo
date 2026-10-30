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
  /**
   * 30/10: comanda más vieja que sigue en cocina (confirmada o en
   * preparación). null si no hay nada esperando. Control de tiempos del salón.
   */
  kitchenSince: Date | null
}

const IN_KITCHEN = new Set(["confirmed", "preparing"])

function toDate(v: Date | string | undefined | null): Date | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

const CLOSED = new Set(["delivered", "cancelled"])

export function summarizeTableActivity(orders: readonly Order[]): Map<string, TableActivity> {
  const map = new Map<string, TableActivity>()
  for (const o of orders) {
    if (o.source !== "pos" || !o.tableId || CLOSED.has(o.status)) continue
    const createdAt = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt)
    const prev = map.get(o.tableId)
    const unpaid = o.payments?.length ? 0 : o.total
    const kitchen = IN_KITCHEN.has(o.status) ? toDate(o.sentToKitchenAt) ?? createdAt : null
    if (!prev) {
      map.set(o.tableId, { total: o.total, unpaid, openedAt: createdAt, rounds: 1, kitchenSince: kitchen })
    } else {
      prev.total += o.total
      prev.unpaid += unpaid
      prev.rounds += 1
      if (createdAt < prev.openedAt) prev.openedAt = createdAt
      if (kitchen && (!prev.kitchenSince || kitchen < prev.kitchenSince)) prev.kitchenSince = kitchen
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

/** Minutos a «35m» / «1h05» (para la mesa, que es chica). */
export function formatElapsedShort(from: Date, now: number): string {
  const minutes = Math.max(0, Math.floor((now - from.getTime()) / 60_000))
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`
}

/** Semáforo de cocina: ámbar desde 20 min, rojo desde 35. */
export const KITCHEN_WARN_MIN = 20
export const KITCHEN_LATE_MIN = 35

/** "35 min", "1 h 05 min". */
export function formatElapsed(from: Date, now: number): string {
  const minutes = Math.max(0, Math.floor((now - from.getTime()) / 60_000))
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  return `${h} h ${String(minutes % 60).padStart(2, "0")} min`
}
