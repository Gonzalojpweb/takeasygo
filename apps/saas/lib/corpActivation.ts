import crypto from 'node:crypto'

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

function secret(): string | null {
  return process.env.CORPORATE_ACTIVATION_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? null
}

/**
 * Token de activación de un solo uso: HMAC-SHA256 sobre
 * `accountId|email|exp` (base64url), válido 24 h. Atado a la cuenta y al
 * email exacto: al canjearse, el usuario se crea SIEMPRE con ese email
 * (no permite registrar otro).
 */
export function signCorpActivationToken(accountId: string, email: string): string | null {
  const s = secret()
  if (!s) return null
  const exp = Date.now() + TOKEN_TTL_MS
  const payload = Buffer.from(JSON.stringify({ a: accountId, e: email.toLowerCase().trim(), x: exp })).toString('base64url')
  const mac = crypto.createHmac('sha256', s).update(payload).digest('base64url')
  return `${payload}.${mac}`
}

export type VerifyResult =
  | { valid: true; accountId: string; email: string }
  | { valid: false; reason: 'malformed' | 'bad-signature' | 'expired' }

export function verifyCorpActivationToken(token: string): VerifyResult {
  const s = secret()
  if (!s) return { valid: false, reason: 'malformed' }
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return { valid: false, reason: 'malformed' }
  const payload = token.slice(0, dot)
  const mac = token.slice(dot + 1)
  const expected = crypto.createHmac('sha256', s).update(payload).digest('base64url')
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: 'bad-signature' }
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data?.a || !data?.e || !data?.x) return { valid: false, reason: 'malformed' }
    if (Date.now() > data.x) return { valid: false, reason: 'expired' }
    return { valid: true, accountId: String(data.a), email: String(data.e).toLowerCase().trim() }
  } catch {
    return { valid: false, reason: 'malformed' }
  }
}
