import type { OrderStatus, PaymentMethod } from "@takeasygo/types"
import { ORDER_TRANSITIONS } from "./transitions"

// ============================================================================
// Checkout del POS — reglas puras compartidas
// ============================================================================
// Auditoría POS Online V1 §5: el cobro partido dividía en partes iguales con
// Math.ceil (cobraba de más) y forzaba "cash" en los comensales que no
// elegían método. Estas funciones son la regla única del cobro en el POS; el
// server (POST /pos/orders/[id]/payments) vuelve a validar que la suma cierre.
// ============================================================================

/** Una parte del cobro tal como la arma el cajero (centavos enteros). */
export interface CheckoutPart {
  /** UUID estable de la parte: es su Idempotency-Key en el server. */
  id: string
  method: PaymentMethod
  amount: number
  /** Comprobante del terminal (cupón / nro. de operación). */
  reference?: string
}

/**
 * Divide `total` en `n` partes que suman EXACTAMENTE `total`: las primeras
 * `total % n` partes llevan un centavo más. Nunca cobra de más ni de menos.
 */
export function splitEvenly(total: number, n: number): number[] {
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("[checkout] total inválido")
  if (!Number.isInteger(n) || n < 1) throw new Error("[checkout] n debe ser ≥ 1")
  const base = Math.floor(total / n)
  const rest = total % n
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0))
}

/** Lo que falta cubrir (negativo = sobra). */
export function remainingToPay(total: number, parts: readonly { amount: number }[]): number {
  return total - parts.reduce((s, p) => s + p.amount, 0)
}

/** El cobro está listo para confirmarse: ≥1 parte, todas > 0, suma exacta. */
export function isCheckoutComplete(total: number, parts: readonly { amount: number }[]): boolean {
  return (
    parts.length > 0 &&
    parts.every((p) => Number.isSafeInteger(p.amount) && p.amount > 0) &&
    remainingToPay(total, parts) === 0
  )
}

/** Vuelto de un pago en efectivo (0 si lo recibido no alcanza). */
export function cashChange(amountDue: number, received: number): number {
  return received > amountDue ? received - amountDue : 0
}

export interface AllocatedPayment {
  /** posId de la parte en ESTA orden. */
  id: string
  method: PaymentMethod
  amount: number
  reference?: string
}

/**
 * Reparte el cobro de una mesa entre sus órdenes (un mozo puede haber
 * mandado varias rondas). Determinístico: recorre las órdenes en el orden
 * dado y las llena con las partes en secuencia, partiendo una parte entre dos
 * órdenes si hace falta. Cada orden recibe partes que suman exactamente su
 * total — que es lo que exige el server.
 *
 * El id de una parte repartida es `${part.id}` si cae entera en una sola
 * orden, o `${part.id}:${orderId}` si se partió: estable entre reintentos.
 */
export function allocatePayments(
  orders: readonly { id: string; total: number }[],
  parts: readonly CheckoutPart[]
): Map<string, AllocatedPayment[]> {
  const grand = orders.reduce((s, o) => s + o.total, 0)
  if (!isCheckoutComplete(grand, parts)) {
    throw new Error("[checkout] las partes no cubren exactamente el total de las órdenes")
  }

  // Cuántas órdenes toca cada parte (para decidir si su id lleva sufijo).
  const touches = new Map<string, number>()
  const plan: { orderId: string; partIndex: number; amount: number }[] = []

  let p = 0
  let leftInPart = parts[0]?.amount ?? 0
  for (const order of orders) {
    let due = order.total
    while (due > 0) {
      const take = Math.min(due, leftInPart)
      plan.push({ orderId: order.id, partIndex: p, amount: take })
      touches.set(parts[p].id, (touches.get(parts[p].id) ?? 0) + 1)
      due -= take
      leftInPart -= take
      if (leftInPart === 0 && p < parts.length - 1) {
        p += 1
        leftInPart = parts[p].amount
      }
    }
  }

  const result = new Map<string, AllocatedPayment[]>()
  for (const order of orders) result.set(order.id, [])
  for (const step of plan) {
    const part = parts[step.partIndex]
    const split = (touches.get(part.id) ?? 0) > 1
    result.get(step.orderId)!.push({
      id: split ? `${part.id}:${step.orderId}` : part.id,
      method: part.method,
      amount: step.amount,
      ...(part.reference ? { reference: part.reference } : {}),
    })
  }
  return result
}

/**
 * Camino legal más corto de `from` a `delivered` según ORDER_TRANSITIONS
 * (sin incluir `from`). Se usa al cerrar una mesa: la comida ya se sirvió,
 * así que una orden `confirmed` recorre preparing → ready → delivered en vez
 * de saltearse el grafo. `[]` si ya está entregada; `null` si no hay camino
 * (cancelada).
 */
export function pathToDelivered(from: OrderStatus): OrderStatus[] | null {
  if (from === "delivered") return []
  const queue: { status: OrderStatus; path: OrderStatus[] }[] = [{ status: from, path: [] }]
  const seen = new Set<OrderStatus>([from])
  while (queue.length > 0) {
    const { status, path } = queue.shift()!
    for (const next of ORDER_TRANSITIONS[status] ?? []) {
      if (seen.has(next)) continue
      const nextPath = [...path, next]
      if (next === "delivered") return nextPath
      seen.add(next)
      queue.push({ status: next, path: nextPath })
    }
  }
  return null
}
