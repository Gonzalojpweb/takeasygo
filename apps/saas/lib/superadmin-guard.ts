/**
 * lib/superadmin-guard.ts — Guardia estricta del SuperAdmin (19/11/2026).
 *
 * Independiente del interruptor `access.central`: para el SuperAdmin el JWT
 * solo no alcanza. Una sesión de SuperAdmin vale si y solo si:
 *   1. El JWT dice role 'superadmin', se emitió por contraseña (credentials)
 *      y con MFA verificado en ese login (`mfa: true`).
 *   2. En la base, el usuario sigue siendo superadmin, está activo y tiene
 *      MFA activado.
 *   3. La sesión no es anterior a `sessionsValidAfter` (cierre global).
 *
 * `superadmin_pending` = entró con contraseña pero todavía no activó MFA:
 * solo puede usar la página de seguridad (/superadmin/seguridad) para
 * enrolarse. Ninguna otra guardia del sistema reconoce ese rol.
 */
import { auth } from '@/lib/auth'

export const SUPERADMIN_PENDING_ROLE = 'superadmin_pending'

export interface StrictSuperAdmin {
  id: string
  email: string | null
  name: string | null
  mfaEnabled: boolean
}

type TokenUser = {
  id?: string | null
  email?: string | null
  name?: string | null
  role?: string | null
  authProvider?: string | null
  mfa?: boolean | null
  issuedAt?: number | null
}

/** ¿El token de esta sesión puede actuar como SuperAdmin pleno? (sin mirar la base) */
export function isMfaVerifiedSuperAdminToken(user: TokenUser | null | undefined): boolean {
  return Boolean(user && user.role === 'superadmin' && user.authProvider === 'credentials' && user.mfa === true)
}

async function loadDbSuperAdmin(id: string) {
  if (!/^[a-f0-9]{24}$/i.test(id)) return null
  const { connectDB } = await import('@/lib/mongoose')
  await connectDB()
  const User = (await import('@/models/User')).default
  return User.findById(id)
    .select('role isActive sessionsValidAfter mfaEnabled email name')
    .lean<{ role: string; isActive?: boolean; sessionsValidAfter?: Date | null; mfaEnabled?: boolean; email?: string; name?: string }>()
}

function cutOff(issuedAt: number | null | undefined, validAfter: Date | null | undefined): boolean {
  if (!validAfter) return false
  if (typeof issuedAt !== 'number' || !Number.isFinite(issuedAt)) return true
  return issuedAt * 1000 < new Date(validAfter).getTime()
}

/** SuperAdmin pleno (MFA verificado) o null. */
export async function getStrictSuperAdmin(): Promise<StrictSuperAdmin | null> {
  const session = await auth()
  const user = session?.user as TokenUser | undefined
  if (!user?.id || !isMfaVerifiedSuperAdminToken(user)) return null
  const db = await loadDbSuperAdmin(user.id)
  if (!db || db.role !== 'superadmin' || db.isActive === false || !db.mfaEnabled) return null
  if (cutOff(user.issuedAt, db.sessionsValidAfter)) return null
  return { id: user.id, email: db.email ?? user.email ?? null, name: db.name ?? user.name ?? null, mfaEnabled: true }
}

/**
 * SuperAdmin que entró con contraseña (con o sin MFA todavía). Solo para la
 * página y las APIs de seguridad (enrolar MFA, ver auditoría, cerrar sesiones).
 */
export async function getSuperAdminForSecurity(): Promise<StrictSuperAdmin | null> {
  const session = await auth()
  const user = session?.user as TokenUser | undefined
  if (!user?.id || user.authProvider !== 'credentials') return null
  if (user.role !== 'superadmin' && user.role !== SUPERADMIN_PENDING_ROLE) return null
  const db = await loadDbSuperAdmin(user.id)
  if (!db || db.role !== 'superadmin' || db.isActive === false) return null
  if (cutOff(user.issuedAt, db.sessionsValidAfter)) return null
  // MFA activado en la base pero esta sesión no lo verificó → no es válida.
  if (db.mfaEnabled && user.mfa !== true) return null
  return { id: user.id, email: db.email ?? user.email ?? null, name: db.name ?? user.name ?? null, mfaEnabled: Boolean(db.mfaEnabled) }
}
