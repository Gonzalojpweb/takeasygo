/**
 * Parseo de los parámetros que MercadoPago agrega a las back_urls
 * (?status=, ?collection_status=, ?payment_status=, ?status_detail=).
 *
 * POR QUÉ EXISTE ESTE MÓDULO
 * ────────────────────────────────────────────────────────────────────────────
 * Cuando MP falla en SU propio checkout hospedado (error de credenciales del
 * tenant, error del form, etc.), NO se crea recurso `payment`. Consecuencias:
 *   - `create-preference` no lanza excepción (la preferencia se creó bien)
 *   - NO hay webhook (no hay payment que notificar)
 *   - el tracking sigue diciendo "Esperando pago" para siempre
 *
 * El ÚNICO punto donde el sistema se entera del fallo es cuando el cliente
 * vuelve por la back_url con estos parámetros. Por eso se parsean acá, on-read,
 * y no en un cron (Vercel Hobby: 1 cron/día — inservible para tiempo real).
 */

export type MpReturnOutcome = 'approved' | 'rejected' | 'pending'

function pick(
  sp: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const v = sp[key]
  if (Array.isArray(v)) return v[0]
  return v
}

/**
 * Normaliza el estado que MP devuelve en la query string.
 * Devuelve `null` cuando no hay parámetros de MP (link compartido a mano).
 */
export function parseMpReturnOutcome(
  sp: Record<string, string | string[] | undefined>
): MpReturnOutcome | null {
  const raw =
    pick(sp, 'status') ??
    pick(sp, 'collection_status') ??
    pick(sp, 'payment_status')
  if (!raw) return null

  const v = raw.toLowerCase()
  if (['approved', 'accredited', 'paid', 'authorized'].includes(v)) return 'approved'
  if (['rejected', 'cancelled', 'failure', 'refunded', 'charged_back', 'expired'].includes(v)) return 'rejected'
  if (['pending', 'in_process', 'in_mediation', 'partially_refunded'].includes(v)) return 'pending'
  return null
}

/** `status_detail` crudo que devuelve MP (ej. `cc_rejected_insufficient_amount`). */
export function parseMpStatusDetail(
  sp: Record<string, string | string[] | undefined>
): string | undefined {
  return pick(sp, 'status_detail') ?? pick(sp, 'cause')
}

const STATUS_DETAIL_MESSAGES: Record<string, string> = {
  cc_rejected_insufficient_amount: 'Saldo insuficiente en la tarjeta.',
  cc_rejected_bad_filled_card_number: 'El número de tarjeta es incorrecto.',
  cc_rejected_bad_filled_date: 'La fecha de vencimiento es incorrecta.',
  cc_rejected_bad_filled_security_code: 'El código de seguridad es incorrecto.',
  cc_rejected_bad_filled_other: 'Revisá los datos de la tarjeta.',
  cc_rejected_blacklist: 'Esta tarjeta no puede usarse para este pago.',
  cc_rejected_call_for_authorize: 'Tu banco pide autorización. Llamalos y volvé a intentar.',
  cc_rejected_card_disabled: 'La tarjeta está deshabilitada.',
  cc_rejected_duplicated_payment: 'Este pago ya fue realizado.',
  cc_rejected_expired_card: 'La tarjeta está vencida.',
  cc_rejected_high_risk: 'El pago fue rechazado por seguridad.',
  cc_rejected_invalid_installments: 'La cantidad de cuotas no es válida.',
  cc_rejected_max_attempts: 'Se superó el máximo de intentos. Probá con otro medio de pago.',
  cc_rejected_other_reason: 'El emisor rechazó el pago. Consultá con tu banco.',
  fraud_rejected: 'El pago fue rechazado por seguridad.',
  account_cancelled: 'Tu cuenta de MercadoPago está bloqueada.',
  token_rejected: 'El código de verificación es incorrecto.',
}

/**
 * Traduce `status_detail` a un mensaje amigable para el cliente.
 * Devuelve `null` si no hay detalle o no lo conocemos (el caller usa un genérico).
 */
export function mpStatusDetailMessage(detail: string | undefined | null): string | null {
  if (!detail) return null
  return STATUS_DETAIL_MESSAGES[detail] ?? null
}
