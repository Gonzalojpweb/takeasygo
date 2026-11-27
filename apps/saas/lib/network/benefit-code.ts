// ============================================================================
// Código de canje de un beneficio de la red (etapa 5) — funciones puras
// ============================================================================
// Informe 21/11/2026, §6.1–6.2 (alternativas evaluadas):
//   · QR dinámico generado por TGO: «TGO1:<REF>:<código>», el código cambia
//     cada 30 s (HOTP con un secreto propio del beneficio, RFC 4226/6238 con el
//     mismo lib/totp del MFA). Una captura deja de servir en ~1 minuto.
//   · Código temporal manual «REF-123456»: el mismo valor, para tipearlo si
//     no hay cámara o el escaneo falla (contingencia del comercio). Se valida
//     igual, en línea y en el servidor.
//   · Un solo uso lógico: lo garantiza el canje atómico (issued → redeemed),
//     no el código: un código válido sobre un beneficio ya canjeado se rechaza.
//   · Tolerancia ±1 paso (relojes desfasados).
// ============================================================================

import crypto from 'crypto'
import { base32Decode, base32Encode, currentStep, hotp } from '@/lib/totp'

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin 0/O/1/I
export const CODE_PREFIX = 'TGO1'
export const STEP_SECONDS = 30

/** Referencia corta y legible para el código manual (8 caracteres). */
export function newBenefitRef(): string {
  const bytes = crypto.randomBytes(8)
  let out = ''
  for (const b of bytes) out += REF_ALPHABET[b % REF_ALPHABET.length]
  return out
}

export function newBenefitSecret(): string {
  return base32Encode(crypto.randomBytes(20))
}

/** Código vigente de un beneficio. */
export function benefitCode(secretB32: string, nowMs = Date.now()): { code: string; step: number; secondsLeft: number } {
  const step = currentStep(nowMs)
  const secondsLeft = STEP_SECONDS - Math.floor((nowMs / 1000) % STEP_SECONDS)
  return { code: hotp(base32Decode(secretB32), step), step, secondsLeft }
}

/** Texto del QR y código manual. */
export function benefitPayload(ref: string, code: string): { qr: string; manual: string } {
  return { qr: `${CODE_PREFIX}:${ref}:${code}`, manual: `${ref}-${code}` }
}

/**
 * Lee lo que escaneó o tipeó el comercio: «TGO1:REF:123456», «REF-123456» o
 * «REF 123456». Devuelve null si no tiene la forma esperada.
 */
export function parseBenefitInput(raw: unknown): { ref: string; code: string } | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toUpperCase()
  let m = /^TGO1:([A-Z2-9]{8}):(\d{6})$/.exec(s)
  if (m) return { ref: m[1], code: m[2] }
  m = /^([A-Z2-9]{8})[\s-]*(\d{6})$/.exec(s.replace(/\s+/g, ' '))
  if (m) return { ref: m[1], code: m[2] }
  return null
}

/**
 * Verifica el código con ±1 paso. Devuelve el paso que coincidió o null.
 * (La reutilización la impide el canje atómico; lastStep evita aceptar un
 * paso viejo después de un intento ya aceptado.)
 */
export function verifyBenefitCode(secretB32: string, code: string, lastStep: number | null, nowMs = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null
  let secret: Buffer
  try { secret = base32Decode(secretB32) } catch { return null }
  const now = currentStep(nowMs)
  for (const step of [now, now - 1, now + 1]) {
    if (lastStep != null && step <= lastStep) continue
    const expected = hotp(secret, step)
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return step
  }
  return null
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(`tgo-network:${email.trim().toLowerCase()}`).digest('hex')
}
