import type {
  CashRegister,
  CashMovement,
  ZReport,
  ZChannelSummary,
  PaymentMethod,
  CashChannel,
} from "@takeasygo/types"

// ============================================================================
// Z Report Generator — Snapshot inmutable de cierre
// ============================================================================
// Decisión: Consenso v1 §3 — El Z se genera UNA VEZ al cerrar y nunca se
// recalcula. Todas las vistas, PDF e impresión leen de este objeto.
//
// Regla de negocio (Consenso §1): expectedAmount (arqueo de efectivo) suma
// SOLO movimientos con paymentMethod === 'cash', sin importar el channel.
// ============================================================================

interface ZReportInput {
  register: CashRegister
  movements: CashMovement[]
  closedBy: string
}

/**
 * Genera el ZReport inmutable a partir del estado de la caja al momento del cierre.
 *
 * @param input - Caja cerrada + movimientos + quién cerró
 * @returns ZReport con todos los totales pre-calculados
 *
 * @example
 * ```ts
 * const z = generateZReport({ register: closedRegister, movements: closedRegister.movements, closedBy: "Juan" })
 * // z.byChannel.counter.sales = 89300
 * // z.byPaymentMethod.cash = 62400
 * ```
 */
export function generateZReport(input: ZReportInput): ZReport {
  const { register, movements, closedBy } = input

  // ── Desglose por canal ───────────────────────────────────────────
  const byChannel: Record<CashChannel, ZChannelSummary> = {
    counter: summarizeByChannel(movements, "counter"),
    takeasygo: summarizeByChannel(movements, "takeasygo"),
  }

  // ── Desglose por método de pago ──────────────────────────────────
  const byPaymentMethod = summarizeByPaymentMethod(movements)

  // ── Totales de movimientos ───────────────────────────────────────
  const incomeTotal = sumByType(movements, ["income", "deposit", "sale"])
  const expenseTotal = sumByType(movements, ["expense", "withdrawal", "refund"])
  const salesTotal = sumByType(movements, ["sale"])
  const refundTotal = sumByType(movements, ["refund"])

  return {
    registerId: register.id,
    tenantId: register.tenantId,
    closedAt: new Date(),
    closedBy,

    // ── Totales generales ──────────────────────────────────────────
    initialAmount: register.initialAmount,
    finalAmount: register.finalAmount ?? 0,
    expectedAmount: register.expectedAmount ?? register.initialAmount,
    difference: register.difference ?? 0,

    // ── Desglose ───────────────────────────────────────────────────
    byChannel,
    byPaymentMethod,

    // ── Movimientos ────────────────────────────────────────────────
    totalMovements: movements.length,
    incomeTotal,
    expenseTotal,
    salesTotal,
    refundTotal,

    // ── Metadata ───────────────────────────────────────────────────
    generatedAt: new Date(),
  }
}

// ============================================================================
// Helpers internos
// ============================================================================

function summarizeByChannel(
  movements: CashMovement[],
  channel: CashChannel
): ZChannelSummary {
  const filtered = movements.filter((m) => m.channel === channel)
  return {
    sales: sumAmounts(filtered.filter((m) => m.type === "sale")),
    income: sumAmounts(filtered.filter((m) => m.type === "income")),
    expenses: sumAmounts(filtered.filter((m) => m.type === "expense")),
    refunds: sumAmounts(filtered.filter((m) => m.type === "refund")),
    movementCount: filtered.length,
  }
}

function summarizeByPaymentMethod(
  movements: CashMovement[]
): Record<PaymentMethod, number> {
  const result: Record<string, number> = {}
  for (const m of movements) {
    result[m.paymentMethod] = (result[m.paymentMethod] ?? 0) + m.amount
  }
  return result as Record<PaymentMethod, number>
}

function sumByType(
  movements: CashMovement[],
  types: string[]
): number {
  return movements
    .filter((m) => types.includes(m.type))
    .reduce((s, m) => s + m.amount, 0)
}

function sumAmounts(movements: CashMovement[]): number {
  return movements.reduce((s, m) => s + m.amount, 0)
}
