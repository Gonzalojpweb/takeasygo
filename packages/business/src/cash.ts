import type {
  CashChannel,
  CashMovement,
  CashMovementType,
  CashRegister,
  PaymentMethod,
} from "@takeasygo/types"

// ============================================================================
// Reglas de caja — lógica pura compartida POS ⇄ SaaS
// ============================================================================
// Extraído de apps/pos/src/services/cash.ts. Estas reglas deben ser
// idénticas en Dexie (offline) y en apps/saas (server): si divergen, el
// arqueo de efectivo deja de cuadrar entre dispositivos.
// ============================================================================

/** Tipos que suman (positivos) cuando el método de pago es efectivo. */
export const POSITIVE_CASH_TYPES: readonly CashMovementType[] = [
  "income",
  "deposit",
  "sale",
]

/** Tipos que restan (negativos) cuando el método de pago es efectivo. */
export const NEGATIVE_CASH_TYPES: readonly CashMovementType[] = [
  "expense",
  "withdrawal",
  "refund",
  "cash_order_not_collected",
]

/**
 * Delta firmado que este movimiento aplica al `expectedAmount` (arqueo).
 *
 * Regla de negocio (Consenso v1 §1): el arqueo de efectivo suma SOLO
 * movimientos con `paymentMethod === 'cash'`, sin importar el `channel`.
 * Un pago con mercadopago/posnet NO mueve el efectivo esperado.
 *
 * @param amount monto siempre positivo (como lo guarda CashMovement)
 * @returns cantidad a sumar (puede ser 0, positiva o negativa)
 */
export function cashExpectedDelta(
  type: CashMovementType,
  paymentMethod: PaymentMethod,
  amount: number
): number {
  if (!affectsCashExpected(paymentMethod)) return 0
  return POSITIVE_CASH_TYPES.includes(type) ? amount : -amount
}

/** ¿Este método de pago mueve el arqueo de efectivo? */
export function affectsCashExpected(paymentMethod: PaymentMethod): boolean {
  return paymentMethod === "cash"
}

/**
 * True si el tipo suma (positivo) al arqueo cuando se paga en efectivo.
 */
export function isPositiveCashType(type: CashMovementType): boolean {
  return POSITIVE_CASH_TYPES.includes(type)
}

/**
 * Idempotencia de movimientos (Consenso v1 §2.1).
 *
 * Si ya existe un movimiento en la caja con el mismo `relatedOrderId` + `type`,
 * es el mismo hecho de negocio reenviado: se devuelve el existente y NO se
 * duplica. Esto es lo que hace seguro el reintento del POS.
 */
export function findMovementForOrder(
  movements: readonly CashMovement[],
  type: CashMovementType,
  relatedOrderId: string | undefined
): CashMovement | undefined {
  if (!relatedOrderId) return undefined
  return movements.find((m) => m.relatedOrderId === relatedOrderId && m.type === type)
}

/** True si el movimiento (orderId + tipo) ya está registrado en la caja. */
export function hasMovementForOrder(
  movements: readonly CashMovement[],
  type: CashMovementType,
  relatedOrderId: string | undefined
): boolean {
  return findMovementForOrder(movements, type, relatedOrderId) !== undefined
}

/**
 * Routing multi-caja (Consenso v1 §2.3).
 *
 * Prioridad:
 * 1. caja con `defaultForChannel === canal`
 * 2. caja con `defaultForChannel !== null` (acepta algún canal específico)
 * 3. primera caja abierta (último fallback — caja "generalista")
 */
export function findRegisterForChannel(
  openRegisters: readonly CashRegister[],
  channel: CashChannel
): CashRegister | undefined {
  if (openRegisters.length === 0) return undefined

  const exact = openRegisters.find((r) => r.defaultForChannel === channel)
  if (exact) return exact

  const withDefault = openRegisters.find((r) => r.defaultForChannel !== null)
  if (withDefault) return withDefault

  return openRegisters[0]
}

/** Devuelve las cajas abiertas de un tenant. */
export function openRegistersOf(
  registers: readonly CashRegister[],
  tenantId: string
): CashRegister[] {
  return registers.filter((r) => r.tenantId === tenantId && r.status === "open")
}
