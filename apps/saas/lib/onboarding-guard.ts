/**
 * Protección del alta de comercios (/empezar → POST /api/onboarding/register).
 *
 * Capas, de la más barata a la más fuerte, además de los límites por IP y por
 * email que ya tiene la ruta:
 *  1. Campo trampa (honeypot): invisible para personas; los bots lo completan.
 *  2. Token de formulario firmado por el server al renderizar /empezar:
 *     solo vale si pasaron ≥ 3 s desde que se abrió la página, dura 24 h y es de
 *     un solo uso (Redis). Un script no puede pegarle directo a la API: tiene
 *     que cargar la página, esperar y hacer una sola alta por carga.
 *  3. Tope global de altas (ataque distribuido desde muchas IPs). Solo cuenta
 *     intentos que pasaron todas las validaciones, para que nadie lo agote con
 *     basura y bloquee a los comercios reales.
 *  4. Limpieza de altas abandonadas (borrador sin verificar, > 7 días, sin
 *     sedes): la base no se llena aunque algo pase, y el email y el enlace
 *     quedan libres para que la persona real vuelva a registrarse.
 */
import crypto from 'crypto'
import type { Types } from 'mongoose'
import { rateLimit } from '@/lib/rateLimit'

export const FORM_MIN_FILL_MS = 3_000
export const FORM_MAX_AGE_MS = 24 * 60 * 60_000
export const GLOBAL_SIGNUPS_PER_10_MIN = 25
export const GLOBAL_SIGNUPS_PER_DAY = 200
export const ABANDONED_SIGNUP_DAYS = 7
/** Nombre del campo trampa (un nombre que los bots completan solos). */
export const HONEYPOT_FIELD = 'website'

function secret(): string {
  const s = process.env.ONBOARDING_FORM_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('Falta AUTH_SECRET para firmar el formulario de alta')
  return s
}

function sign(issuedAt: number): string {
  return crypto.createHmac('sha256', secret()).update(`onb-form:${issuedAt}`).digest('base64url')
}

/** Token para el formulario de /empezar (se genera al renderizar la página). */
export function issueFormToken(now: number = Date.now()): string {
  return `${now}.${sign(now)}`
}

export type FormTokenCheck =
  | { ok: true; signature: string }
  | { ok: false; reason: 'missing' | 'invalid' | 'too_fast' | 'expired' }

/** Firma válida y antigüedad entre FORM_MIN_FILL_MS y FORM_MAX_AGE_MS. No marca el uso. */
export function checkFormToken(token: unknown, now: number = Date.now()): FormTokenCheck {
  if (typeof token !== 'string' || !token) return { ok: false, reason: 'missing' }
  const [tsRaw, signature] = token.split('.')
  const issuedAt = Number(tsRaw)
  if (!Number.isSafeInteger(issuedAt) || !signature) return { ok: false, reason: 'invalid' }
  const expected = sign(issuedAt)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'invalid' }
  const age = now - issuedAt
  if (age < FORM_MIN_FILL_MS) return { ok: false, reason: 'too_fast' }
  if (age > FORM_MAX_AGE_MS) return { ok: false, reason: 'expired' }
  return { ok: true, signature }
}

/** Marca el token como usado. false si ya se había usado (reintento de script). */
export async function consumeFormToken(signature: string): Promise<boolean> {
  const r = await rateLimit(`onb:reg:tok:${signature}`, 1, FORM_MAX_AGE_MS)
  return r.success
}

/** Tope global de altas nuevas. Llamar recién antes de crear la cuenta. */
export async function takeGlobalSignupSlot(): Promise<boolean> {
  const burst = await rateLimit('onb:reg:global:10m', GLOBAL_SIGNUPS_PER_10_MIN, 10 * 60_000)
  if (!burst.success) return false
  const daily = await rateLimit('onb:reg:global:day', GLOBAL_SIGNUPS_PER_DAY, 24 * 60 * 60_000)
  return daily.success
}

/** IP del cliente: x-real-ip (Vercel) o la primera de x-forwarded-for. */
export function clientIp(headers: Headers): string {
  const real = headers.get('x-real-ip')?.trim()
  if (real) return real
  const fwd = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return fwd || 'unknown'
}

/**
 * Borra altas abandonadas: borrador, email nunca verificado, creadas hace más
 * de ABANDONED_SIGNUP_DAYS días y sin ninguna sede. Devuelve cuántas borró.
 */
export async function purgeAbandonedSignups(now: Date = new Date()): Promise<number> {
  const [{ default: Tenant }, { default: User }, { default: Location }] = await Promise.all([
    import('@/models/Tenant'),
    import('@/models/User'),
    import('@/models/Location'),
  ])
  const cutoff = new Date(now.getTime() - ABANDONED_SIGNUP_DAYS * 24 * 60 * 60_000)
  const drafts = await Tenant.find({ 'onboarding.status': 'draft', createdAt: { $lt: cutoff } })
    .select('_id')
    .limit(500)
    .lean<{ _id: Types.ObjectId }[]>()
  let purged = 0
  for (const t of drafts) {
    const [verifiedUser, hasLocation] = await Promise.all([
      User.exists({ tenantId: t._id, emailVerified: { $ne: null } }),
      Location.exists({ tenantId: t._id }),
    ])
    if (verifiedUser || hasLocation) continue
    await User.deleteMany({ tenantId: t._id, emailVerified: null })
    await Tenant.deleteOne({ _id: t._id, 'onboarding.status': 'draft' })
    purged++
  }
  return purged
}
