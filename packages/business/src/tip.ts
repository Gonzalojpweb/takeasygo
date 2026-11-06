import type { CashMovement, PaymentMethod } from "@takeasygo/types"

// ============================================================================
// Propinas — reglas puras compartidas POS ⇄ SaaS (piloto 06/11/2026)
// ============================================================================
// La propina NO es venta: no entra en el total de la orden, no se factura y
// no suma en los reportes de ventas. Se registra en la caja como un ingreso
// (`type: 'income'`) con su método de pago: en efectivo mueve el arqueo, con
// tarjeta o transferencia queda en el desglose por método (el lote del
// posnet la incluye).
//
// Marca: `relatedOrderId = <orderId>:tip`. Es determinística (reintento sin
// duplicar: índice único registerId + relatedOrderId + type) y permite
// separar las propinas del resto de los ingresos en el Z.
//
// Mercado Pago queda afuera a propósito: cobrarla por el Point exigiría tocar
// el flujo de MP (prohibido sin aprobación expresa).
// ============================================================================

export const TIP_RELATED_SUFFIX = ":tip"

/** Métodos con los que se puede dejar propina en el POS. */
export const TIP_METHODS: readonly PaymentMethod[] = ["cash", "posnet_debit", "posnet_credit", "transfer"]

/** Porcentajes sugeridos en el cobro. */
export const TIP_PERCENTS: readonly number[] = [10, 15]

/** Tope de seguridad: una propina mayor al total de la cuenta es un error de tipeo. */
export function maxTipCents(totalCents: number): number {
  return Math.max(0, Math.round(totalCents))
}

export function isTipMethod(method: unknown): method is PaymentMethod {
  return typeof method === "string" && (TIP_METHODS as readonly string[]).includes(method)
}

/** relatedOrderId del movimiento de propina de una orden. */
export function tipRelatedOrderId(orderId: string): string {
  return `${orderId}${TIP_RELATED_SUFFIX}`
}

export function isTipMovement(m: Pick<CashMovement, "type" | "relatedOrderId">): boolean {
  return m.type === "income" && typeof m.relatedOrderId === "string" && m.relatedOrderId.endsWith(TIP_RELATED_SUFFIX)
}

/**
 * Propina sugerida: porcentaje del total, redondeada a $100 hacia arriba
 * (nadie deja $1.234,56 de propina). Centavos.
 */
export function suggestedTipCents(totalCents: number, percent: number): number {
  if (totalCents <= 0 || percent <= 0) return 0
  const raw = (totalCents * percent) / 100
  return Math.ceil(raw / 10_000) * 10_000
}

/** Propina válida: entero positivo, método permitido y no mayor al total. */
export function isTipValid(tip: { amount: number; method: PaymentMethod } | null | undefined, totalCents: number): boolean {
  if (!tip) return true
  return Number.isSafeInteger(tip.amount) && tip.amount > 0 && tip.amount <= maxTipCents(totalCents) && isTipMethod(tip.method)
}
