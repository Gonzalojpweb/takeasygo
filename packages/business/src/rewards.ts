/**
 * Validación pura de canje de premios por puntos.
 *
 * Compartida por el SaaS (canje en checkout y canje standalone) y por el POS,
 * para que la regla de negocio viva en un solo lugar (@takeasygo/business) y no
 * se duplique entre apps.
 *
 * No toca base de datos: el llamador resuelve miembro/ítems y arma el input.
 */

export type RewardRedemptionMode = "checkout" | "standalone"

export type RewardRejectionReason =
  | "invalid_points"
  | "insufficient"
  | "advance_limit_exceeded"
  | "pending_advance"

export interface RewardRedemptionInput {
  mode: RewardRedemptionMode
  /** Saldo actual de puntos del miembro (member.loyalty.points) */
  pointsBalance: number
  /** Puntos que pide gastar el cliente (checkout) o costo del ítem (standalone) */
  pointsRequired: number
  /** Límite de adelanto del tenant (tenant.loyalty.sosLimit) */
  advanceLimit?: number
  /** Techo del adelanto del tenant (tenant.loyalty.sosMaxLimit) — solo checkout */
  advanceMaxLimit?: number
  /** Miembro con adelanto pendiente de consolidar (member.sosConfig.hasPendingSos) */
  hasPendingAdvance?: boolean
  /** Puntos ya usados del adelanto pendiente (member.sosConfig.sosUsed) */
  pendingAdvanceUsed?: number
}

export type RewardRedemptionDecision =
  | {
      valid: true
      projectedBalance: number
      /** Saldo exacto: se fuerza un micro-adelanto (regla de matrices.md) */
      microAdvanceRequired: boolean
      /** Monto del micro-adelanto (0 si no aplica) */
      microAdvanceAmount: number
      /** Adelanto explícito que se aplicará (0 si no hace falta) */
      advanceAmount: number
    }
  | {
      valid: false
      reason: RewardRejectionReason
      /** Mensaje ya redactado para el usuario (checkout) */
      error?: string
      missingPoints?: number
      advanceLimitAvailable?: number
    }

export const PENDING_ADVANCE_ERROR =
  "Tenés un adelanto de puntos pendiente. Completá una compra para consolidar tu saldo antes de canjear."

/** El micro-adelanto es el 20% del costo del premio (per matrices.md). */
export const MICRO_ADVANCE_RATIO = 0.2

/** Micro-adelanto: 20% del costo del premio, nunca mayor que el límite del tenant. */
export function computeMicroAdvance(pointsCost: number, advanceLimit: number): number {
  return Math.min(Math.ceil(pointsCost * MICRO_ADVANCE_RATIO), advanceLimit)
}

/**
 * ¿Hay un adelanto pendiente que bloquea el canje?
 * - standalone: bloquea solo si el miembro ya usó puntos del adelanto
 *   (el checkout no permite adelantar, así que solo importa si quedó con deuda real).
 * - checkout: se consulta únicamente cuando el saldo no alcanza y haría falta
 *   adelantar — un adelanto pendiente no impide comprar con saldo suficiente.
 */
export function isPendingAdvanceBlocking(
  hasPendingAdvance: boolean | undefined | null,
  pendingAdvanceUsed: number | undefined | null,
  requireUsedAmount: boolean
): boolean {
  if (!hasPendingAdvance) return false
  if (requireUsedAmount) return (pendingAdvanceUsed ?? 0) > 0
  return true
}

/**
 * Evalúa si el miembro puede canjear `pointsRequired` puntos con su saldo actual.
 *
 * - mode 'standalone': sin adelanto; el saldo debe alcanzar; saldo en 0 → micro-adelanto.
 * - mode 'checkout': permite adelanto (SOS) hasta min(sosLimit, sosMaxLimit),
 *   siempre que no haya otro adelanto pendiente.
 */
export function evaluateRewardRedemption(input: RewardRedemptionInput): RewardRedemptionDecision {
  const required = input.pointsRequired
  const projectedBalance = input.pointsBalance - required

  if (input.mode === "checkout" && required <= 0) {
    return { valid: false, reason: "invalid_points", error: "Puntos requeridos inválidos" }
  }

  if (input.mode === "standalone") {
    if (isPendingAdvanceBlocking(input.hasPendingAdvance, input.pendingAdvanceUsed, true)) {
      return { valid: false, reason: "pending_advance", error: PENDING_ADVANCE_ERROR }
    }

    if (projectedBalance < 0) {
      return { valid: false, reason: "insufficient", missingPoints: -projectedBalance }
    }

    const microAdvanceRequired = projectedBalance === 0
    return {
      valid: true,
      projectedBalance,
      microAdvanceRequired,
      microAdvanceAmount: microAdvanceRequired
        ? computeMicroAdvance(required, input.advanceLimit ?? 0)
        : 0,
      advanceAmount: 0,
    }
  }

  // ── checkout ──────────────────────────────────────────────────────────
  if (projectedBalance > 0) {
    return {
      valid: true,
      projectedBalance,
      microAdvanceRequired: false,
      microAdvanceAmount: 0,
      advanceAmount: 0,
    }
  }

  if (projectedBalance === 0) {
    return {
      valid: true,
      projectedBalance,
      microAdvanceRequired: true,
      microAdvanceAmount: computeMicroAdvance(required, input.advanceLimit ?? 0),
      advanceAmount: 0,
    }
  }

  // Saldo insuficiente: evaluar Reward Advance (antes llamado SOS).
  const missingPoints = -projectedBalance
  const effectiveAdvanceLimit = Math.min(input.advanceLimit ?? 0, input.advanceMaxLimit ?? 0)

  if (effectiveAdvanceLimit <= 0 || missingPoints > effectiveAdvanceLimit) {
    return {
      valid: false,
      reason: "advance_limit_exceeded",
      missingPoints,
      advanceLimitAvailable: effectiveAdvanceLimit,
      error: `Te faltan ${missingPoints} puntos para canjear este premio. Límite de adelanto: ${
        effectiveAdvanceLimit > 0 ? effectiveAdvanceLimit : "no disponible"
      }.`,
    }
  }

  if (isPendingAdvanceBlocking(input.hasPendingAdvance, input.pendingAdvanceUsed, false)) {
    return {
      valid: false,
      reason: "pending_advance",
      missingPoints,
      advanceLimitAvailable: effectiveAdvanceLimit,
      error: PENDING_ADVANCE_ERROR,
    }
  }

  return {
    valid: true,
    projectedBalance,
    microAdvanceRequired: false,
    microAdvanceAmount: 0,
    advanceAmount: missingPoints,
  }
}
