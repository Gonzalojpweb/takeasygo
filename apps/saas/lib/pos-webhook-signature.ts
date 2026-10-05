import crypto from 'crypto'

/**
 * Verificación de firma del webhook POS (FUDO, BISTROSOFT, etc.).
 *
 * Contrato:
 *   - `X-POS-Signature` (alias `X-Webhook-Signature`): HMAC-SHA256 en hex del
 *     rawBody exacto, con el secreto del tenant (`tenant.posIntegration.webhookSecret`).
 *   - El body debe incluir un `timestamp` (ISO, unix seconds o unix ms) dentro
 *     de ±POS_WEBHOOK_TOLERANCE_SECONDS respecto de ahora (anti-replay). Al
 *     estar dentro del body firmado, no puede manipularse sin romper la firma.
 *
 * La firma es obligatoria. El caso sandbox de FUDO (que puede omitirla) solo
 * se habilita con `POS_WEBHOOK_ALLOW_UNSIGNED=1` en el entorno.
 */

/** Ventana máxima de frescura del timestamp del payload (anti-replay). */
export const POS_WEBHOOK_TOLERANCE_SECONDS = 300

export type PosWebhookSignatureResult =
  | { ok: true; unsigned: false }
  | { ok: true; unsigned: true }
  | { ok: false; status: 401; error: string }

/** Comparación en tiempo constante de dos hex (null si no son hex válidos de igual longitud). */
function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'hex')
    const bufB = Buffer.from(b, 'hex')
    if (bufA.length === 0 || bufA.length !== bufB.length) return false
    return crypto.timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

export function computePosWebhookSignature(secret: string, rawBody: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
}

/** Acepta unix seconds, unix ms o fecha ISO. Devuelve seconds o null. */
function parseTimestampSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value > 1e12 ? Math.round(value / 1000) : Math.round(value)
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const trimmed = value.trim()
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed)
      return n > 1e12 ? Math.round(n / 1000) : n
    }
    const parsed = Date.parse(trimmed)
    if (!Number.isNaN(parsed) && parsed > 0) return Math.round(parsed / 1000)
  }
  return null
}

export function verifyPosWebhookSignature(opts: {
  rawBody: string
  signature: string | null
  timestamp: unknown
  secret: string
  allowUnsigned: boolean
  nowSeconds?: number
}): PosWebhookSignatureResult {
  if (!opts.signature) {
    if (opts.allowUnsigned) return { ok: true, unsigned: true }
    return { ok: false, status: 401, error: 'Firma requerida' }
  }

  const expected = computePosWebhookSignature(opts.secret, opts.rawBody)
  if (!timingSafeEqualHex(opts.signature.trim(), expected)) {
    return { ok: false, status: 401, error: 'Invalid signature' }
  }

  const tsSeconds = parseTimestampSeconds(opts.timestamp)
  if (tsSeconds === null) {
    return { ok: false, status: 401, error: 'Falta timestamp' }
  }
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - tsSeconds) > POS_WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, status: 401, error: 'Timestamp fuera de ventana' }
  }

  return { ok: true, unsigned: false }
}
