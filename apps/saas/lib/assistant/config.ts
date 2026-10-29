// ============================================================================
// TEO — límites del harness (valores iniciales del diseño; ajustar con el uso)
// ============================================================================

export const ASSISTANT_LIMITS = {
  /** Largo máximo de un mensaje del usuario. */
  maxMessageChars: 1000,
  /** Mensajes por usuario por día (zona del servidor, UTC). */
  perUserPerDay: 40,
  /** Mensajes por usuario por minuto. */
  perUserPerMinute: 6,
  /** Intercambios previos que se reenvían al modelo (3 pares = 6 mensajes). */
  historyExchanges: 3,
  /** Tope de tokens de la respuesta. */
  maxOutputTokens: 600,
  /** Presupuesto de documentos por pregunta (tokens estimados). */
  docsBudgetTokens: 6000,
  /** Rechazos seguidos tras los cuales se responde fijo sin gastar modelo. */
  maxConsecutiveRefusals: 3,
} as const

/** Tope mensual de gasto de toda la plataforma (USD). Además del tope del panel del proveedor. */
export function monthlyBudgetUsd(): number {
  const raw = Number(process.env.ASSISTANT_MONTHLY_BUDGET_USD)
  return Number.isFinite(raw) && raw > 0 ? raw : 50
}

/** WhatsApp de soporte (solo dígitos, con código de país) para el botón «Contactar a soporte». */
export function supportWhatsapp(): string | null {
  const digits = (process.env.ASSISTANT_SUPPORT_WHATSAPP ?? '').replace(/\D/g, '')
  return digits.length >= 8 ? digits : null
}

/** Estimación simple de tokens (≈ 4 caracteres por token en español). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
