// =====================================================================
// mp-oauth-state — State firmado (HMAC-SHA256) para el OAuth de MP
// =====================================================================
// El state viaja por el navegador (redirect a MercadoPago y vuelta).
// Se firma con AUTH_SECRET para que el callback pueda comprobar:
//   - que lo emitió esta app (firma),
//   - que no expiró (nonce + exp, TTL 10 min),
//   - a qué tenant apunta (tenantSlug),
// y luego el callback exige sesión de admin de ese mismo tenant.
// =====================================================================
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

export interface MpOauthState {
  tenantSlug: string
  accountId?: string
  nonce: string
  ts: number
  exp: number
}

const STATE_TTL_MS = 10 * 60 * 1000

function resolveSecret(secret?: string): string | null {
  const s = secret ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  return s || null
}

function signPayload(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

export function signMpOauthState(
  input: { tenantSlug: string; accountId?: string | null },
  secret?: string
): string {
  const s = resolveSecret(secret)
  if (!s) throw new Error('AUTH_SECRET no definido: no se puede firmar el state de MP OAuth')
  if (!input.tenantSlug) throw new Error('tenantSlug requerido para firmar el state de MP OAuth')

  const now = Date.now()
  const state: MpOauthState = {
    tenantSlug: input.tenantSlug,
    ...(input.accountId ? { accountId: input.accountId } : {}),
    nonce: randomBytes(16).toString('base64url'),
    ts: now,
    exp: now + STATE_TTL_MS,
  }
  const payload = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url')
  return `${payload}.${signPayload(payload, s)}`
}

export function verifyMpOauthState(raw: string | null | undefined, secret?: string): MpOauthState | null {
  const s = resolveSecret(secret)
  if (!raw || !s) return null

  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = raw.slice(0, dot)
  const signature = raw.slice(dot + 1)
  if (!payload || !signature) return null

  const expected = signPayload(payload, s)
  const a = Buffer.from(signature, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as MpOauthState
    if (typeof state.tenantSlug !== 'string' || !state.tenantSlug) return null
    if (typeof state.nonce !== 'string' || !state.nonce) return null
    if (typeof state.ts !== 'number' || typeof state.exp !== 'number') return null
    if (Date.now() > state.exp) return null
    return state
  } catch {
    return null
  }
}
