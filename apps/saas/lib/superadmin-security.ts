/**
 * lib/superadmin-security.ts — Piezas compartidas de las APIs de seguridad
 * del SuperAdmin (/api/superadmin/security/*). 19/11/2026.
 */
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSuperAdminForSecurity, type StrictSuperAdmin } from '@/lib/superadmin-guard'
import { rateLimit } from '@/lib/rateLimit'

export type SecurityContext = { admin: StrictSuperAdmin } | { error: NextResponse }

/** Guardia + rate-limit por cuenta para las acciones sensibles. */
export async function securityContext(limitKey: string, limit = 10): Promise<SecurityContext> {
  const admin = await getSuperAdminForSecurity()
  if (!admin) return { error: NextResponse.json({ error: 'Acceso denegado' }, { status: 403 }) }
  const rl = await rateLimit(`sa-sec:${limitKey}:${admin.id}`, limit, 15 * 60_000)
  if (!rl.success) {
    return { error: NextResponse.json({ error: 'Demasiados intentos. Esperá unos minutos.' }, { status: 429 }) }
  }
  return { admin }
}

/** Reautenticación: compara la contraseña actual (bcrypt). */
export async function checkPassword(userId: string, password: unknown): Promise<boolean> {
  if (typeof password !== 'string' || !password) return false
  const User = (await import('@/models/User')).default
  const doc = await User.findById(userId).select('password').lean<{ password?: string }>()
  if (!doc?.password) return false
  return bcrypt.compare(password, doc.password)
}

/**
 * Reautenticación con el segundo factor: TOTP vigente (anti-replay atómico).
 * No acepta códigos de recuperación (esos son solo para entrar).
 */
export async function checkTotp(userId: string, code: unknown): Promise<boolean> {
  if (typeof code !== 'string') return false
  const User = (await import('@/models/User')).default
  const doc = await User.findById(userId).select('+mfaSecret +mfaLastStep mfaEnabled').lean<{
    mfaEnabled?: boolean; mfaSecret?: string | null; mfaLastStep?: number | null
  }>()
  if (!doc?.mfaEnabled || !doc.mfaSecret) return false
  const { decrypt } = await import('@/lib/crypto')
  const { verifyTotp } = await import('@/lib/totp')
  let secret = ''
  try { secret = decrypt(doc.mfaSecret) } catch { return false }
  const step = verifyTotp(secret, code, doc.mfaLastStep ?? null)
  if (step === null) return false
  const res = await User.updateOne(
    { _id: userId, $or: [{ mfaLastStep: null }, { mfaLastStep: { $exists: false } }, { mfaLastStep: { $lt: step } }] },
    { $set: { mfaLastStep: step } },
  )
  return res.modifiedCount === 1
}

/** Corte de sesiones redondeado al segundo (el iat del JWT es en segundos). */
export function sessionCutoffNow(): Date {
  return new Date(Math.floor(Date.now() / 1000) * 1000)
}
