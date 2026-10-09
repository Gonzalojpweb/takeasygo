import type { CashMovementType, PaymentMethod } from "@takeasygo/types"
import { db } from "../db/dexie"
import { addMovement, getRegisterForChannel } from "./cash"
import { resolvePaymentMethod } from "./payment"

// ============================================================================
// Counter Sale — Cobro del Counter → Caja
// ============================================================================
// Por qué: handlePay() mueve plata real al cajón pero hasta ahora no dejaba
// rastro en caja: ni el Z report ni el arqueo veían las ventas de salón /
// mostrador. La cadena SaaS → cash_sale → POS no cubre este caso porque las
// órdenes POS nacen con payment.status='approved' (el POS cobra al instante)
// y el hook de delivery del SaaS solo dispara con status='pending'.
//
// Flujo (mismo esqueleto que handleTakeasyGOSale, Consenso §2):
//   1. Solo efectivo: tarjetas/transferencias no mueven cajón acá (se
//      registran al confirmarse el cobro por su propio canal).
//   2. Idempotencia local por relatedOrderId + type (§2.1): en cajas y en
//      la cola de pendientes.
//   3. Sin caja abierta → pendingMovements (§2.2), el manager la reasigna.
//   4. Server rechaza (caja cerrada en otra terminal, red) → se encola:
//      la venta ya sucedió, el movimiento no se pierde.
//
// Cobros parciales (varios métodos por orden): relatedOrderId lleva sufijo
// `#n` por método. El índice único del server es (registerId,
// relatedOrderId, type): sin el sufijo, el segundo método chocaría con el
// primero y la parte 2/3 del cobro no se registraría.
// ============================================================================

export interface CounterSaleInput {
  tenantId: string
  /** Monto en centavos de esta parte del cobro */
  amount: number
  paymentMethod: PaymentMethod
  /** Concepto visible en caja (ej: "Pedido M5") */
  reason: string
  /**
   * Huella de idempotencia: order.id solo, o `order.id#n` si la orden se
   * paga con varios métodos.
   */
  relatedOrderId: string
}

export type CounterSaleResult =
  | { status: "registered"; movementId: string }
  | { status: "pending"; pendingId: string }
  | { status: "duplicate"; existingMovementId: string }
  | { status: "skipped" }

async function enqueuePending(
  input: CounterSaleInput,
  tenantId: string
): Promise<CounterSaleResult> {
  const pendingId = crypto.randomUUID()
  await db.pendingMovements.add({
    id: pendingId,
    tenantId,
    type: "sale" as CashMovementType,
    amount: input.amount,
    reason: input.reason,
    userId: "system",
    timestamp: new Date(),
    relatedOrderId: input.relatedOrderId,
    channel: "counter",
    paymentMethod: input.paymentMethod,
    source: "counter_sale",
    createdAt: new Date(),
  })
  return { status: "pending", pendingId }
}

/**
 * Registra un cobro en efectivo del Counter en la caja activa.
 *
 * @returns Resultado del registro; nunca lanza por fallos del server
 *          (la venta ya sucedió → se encola como pendiente).
 */
export async function registerCounterSale(
  input: CounterSaleInput
): Promise<CounterSaleResult> {
  const { tenantId, amount, paymentMethod, reason, relatedOrderId } = input

  // ── 1. Solo efectivo mueve cajón acá ─────────────────────────────
  if (resolvePaymentMethod(paymentMethod) !== "cash") {
    return { status: "skipped" }
  }

  // Guarda de argumentos (el server repite la regla: monto mínimo 1).
  if (amount <= 0) throw new Error("[counter-sale] El monto debe ser positivo")

  // ── 2. Idempotencia local: ¿ya registrado en alguna caja? ────────
  const allRegisters = await db.cashRegister
    .where("tenantId")
    .equals(tenantId)
    .toArray()

  for (const reg of allRegisters) {
    const existing = reg.movements.find(
      (m) => m.relatedOrderId === relatedOrderId && m.type === "sale"
    )
    if (existing) {
      return { status: "duplicate", existingMovementId: existing.id }
    }
  }

  // ¿Ya encolado por un intento previo (sin caja o con error)?
  const queued = await db.pendingMovements
    .where("relatedOrderId")
    .equals(relatedOrderId)
    .toArray()
  const alreadyQueued = queued.find((p) => p.tenantId === tenantId)
  if (alreadyQueued) {
    return { status: "pending", pendingId: alreadyQueued.id }
  }

  // ── 3. Caja target del canal counter (§2.3 routing) ──────────────
  const targetRegister = await getRegisterForChannel(tenantId, "counter")
  if (!targetRegister) {
    return enqueuePending(input, tenantId)
  }

  // ── 4. Registrar en server; si falla, no perder la venta ─────────
  try {
    const { movement } = await addMovement(
      tenantId,
      targetRegister.id,
      "sale",
      amount,
      reason,
      "system",
      "counter",
      paymentMethod,
      relatedOrderId
    )
    return { status: "registered", movementId: movement.id }
  } catch (err) {
    console.error(
      "[counter-sale] addMovement failed, encolando pendiente:",
      err
    )
    return enqueuePending(input, tenantId)
  }
}
