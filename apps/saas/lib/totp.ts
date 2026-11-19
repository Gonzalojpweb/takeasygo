/**
 * lib/totp.ts — MFA por TOTP (RFC 6238) y códigos de recuperación.
 *
 * Sin dependencias externas ni servicios pagos: HMAC-SHA1 de Node, 6 dígitos,
 * paso de 30 s. Compatible con Google Authenticator, Microsoft Authenticator,
 * 1Password, Authy, etc. (apps gratuitas).
 *
 * - El secreto se guarda cifrado (AES-256-GCM, lib/crypto.ts).
 * - Los códigos de recuperación se guardan hasheados (SHA-256) y se muestran
 *   una sola vez.
 * - `verifyTotp` devuelve el paso usado para impedir la reutilización del mismo
 *   código (anti-replay: el paso debe ser mayor al último aceptado).
 */
import crypto from 'crypto'

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP_SECONDS = 30
const DIGITS = 6

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = B32.indexOf(ch)
    if (idx === -1) throw new Error('base32 inválido')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** Secreto nuevo de 20 bytes (160 bits, lo que recomienda la RFC 4226). */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20))
}

/** Código HOTP para un contador dado (RFC 4226). */
export function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const hmac = crypto.createHmac('sha1', secret).update(msg).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0')
}

export function currentStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / STEP_SECONDS)
}

/**
 * Verifica un código TOTP con tolerancia de ±1 paso (reloj del celular
 * desfasado hasta ~30 s). Devuelve el paso que coincidió, o null.
 * `lastStep`: último paso aceptado; cualquier paso ≤ a ese se rechaza.
 */
export function verifyTotp(
  secretB32: string,
  code: string,
  lastStep: number | null | undefined = null,
  nowMs = Date.now(),
): number | null {
  const clean = String(code ?? '').replace(/\s+/g, '')
  if (!/^\d{6}$/.test(clean)) return null
  let secret: Buffer
  try {
    secret = base32Decode(secretB32)
  } catch {
    return null
  }
  const now = currentStep(nowMs)
  let matched: number | null = null
  for (const step of [now - 1, now, now + 1]) {
    const expected = hotp(secret, step)
    // Comparación en tiempo constante; se recorren los 3 pasos siempre.
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) matched = step
  }
  if (matched === null) return null
  if (typeof lastStep === 'number' && matched <= lastStep) return null
  return matched
}

/** URI otpauth:// para el QR de la app autenticadora. */
export function totpUri(secretB32: string, accountLabel: string, issuer = 'TakeasyGO'): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`)
  const params = new URLSearchParams({
    secret: secretB32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

// ── Códigos de recuperación ─────────────────────────────────────────────────

const RC_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin 0/O/1/I

function normalizeRecoveryCode(code: string): string {
  return String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex')
}

/** 10 códigos con formato XXXXX-XXXXX (50 bits cada uno). */
export function generateRecoveryCodes(count = 10): { plain: string[]; hashed: string[] } {
  const plain: string[] = []
  for (let i = 0; i < count; i++) {
    const bytes = crypto.randomBytes(10)
    let s = ''
    for (const b of bytes) s += RC_ALPHABET[b & 31]
    plain.push(`${s.slice(0, 5)}-${s.slice(5)}`)
  }
  return { plain, hashed: plain.map(hashRecoveryCode) }
}

/** ¿Parece un código de recuperación (y no un TOTP de 6 dígitos)? */
export function looksLikeRecoveryCode(code: string): boolean {
  return normalizeRecoveryCode(code).length === 10
}

/**
 * Busca el código entre los hashes guardados. Devuelve el índice que coincide
 * (para borrarlo: un solo uso) o -1.
 */
export function matchRecoveryCode(code: string, hashes: string[] | null | undefined): number {
  if (!hashes?.length || !looksLikeRecoveryCode(code)) return -1
  const target = Buffer.from(hashRecoveryCode(code), 'hex')
  let found = -1
  hashes.forEach((h, i) => {
    const buf = Buffer.from(String(h), 'hex')
    if (buf.length === target.length && crypto.timingSafeEqual(buf, target)) found = i
  })
  return found
}
