import mongoose from 'mongoose'
import { isAccessMode, type AccessMode } from '@/lib/access-central'

// ============================================================================
// Interruptor de plataforma `org.access` (multi-marca, PR 8)
// ============================================================================
//   off     → las membresías de organización no dan acceso (valor por defecto,
//             idéntico a hoy).
//   log     → no dan acceso, pero cada vez que una habría dado acceso a un
//             comercio se registra (AccessShadowEvent, motivo org_membership).
//   enforce → la proyección decide: en un comercio de su organización, el
//             miembro opera con el rol y las sedes de su membresía.
// Fuente: variable ORG_ACCESS_MODE (emergencia, manda) o
// PlatformConfig.orgAccess (lo cambia el superadmin sin redeploy). Caché de
// 15 s por instancia. Sin base o ante un error: `off` (falla cerrado).
//
// Las páginas del panel leen la sesión por `getAdminSession`, que con
// `access.central` en off/log decide con el JWT: para que un miembro vea las
// PÁGINAS de una marca hace falta además `access.central = enforce`. Con
// access.central apagado, un miembro queda afuera de las páginas (cerrado).
// ============================================================================

const TTL_MS = 15_000
let cached: { at: number; mode: AccessMode } | null = null

/** Solo para tests y para el cambio desde el superadmin. */
export function clearOrgAccessModeCache(): void {
  cached = null
}

export async function getOrgAccessMode(): Promise<AccessMode> {
  const env = process.env.ORG_ACCESS_MODE?.trim().toLowerCase()
  if (isAccessMode(env)) return env
  if (cached && Date.now() - cached.at < TTL_MS) return cached.mode
  let mode: AccessMode = 'off'
  try {
    // Sin base conectada todavía (instancia recién arrancada): `off` sin
    // guardarlo, para no quedar 15 s apagado cuando la base conecta enseguida.
    if (mongoose.connection.readyState !== 1) return 'off'
    const PlatformConfig = (await import('@/models/PlatformConfig')).default
    const doc = await PlatformConfig.findById('platform').select('orgAccess').lean<{ orgAccess?: string }>()
    if (isAccessMode(doc?.orgAccess)) mode = doc.orgAccess
  } catch {
    return 'off' // falla cerrado, sin guardar: se reintenta en la próxima lectura
  }
  cached = { at: Date.now(), mode }
  return mode
}

// ============================================================================
// Interruptor `org.dashboard` (multi-marca PR 10): panel de solo lectura con
// los números del grupo en /grupo/[slug]. off por defecto (la página da 404).
// Fuente: ORG_DASHBOARD_MODE (manda) o PlatformConfig.orgDashboard. Caché de
// 15 s; sin base o ante un error: off, sin guardarlo.
// ============================================================================

export type DashboardMode = 'off' | 'on'
let dashCached: { at: number; mode: DashboardMode } | null = null

export function clearOrgDashboardModeCache(): void {
  dashCached = null
}

export function isDashboardMode(value: unknown): value is DashboardMode {
  return value === 'off' || value === 'on'
}

export async function getOrgDashboardMode(): Promise<DashboardMode> {
  const env = process.env.ORG_DASHBOARD_MODE?.trim().toLowerCase()
  if (isDashboardMode(env)) return env
  if (dashCached && Date.now() - dashCached.at < TTL_MS) return dashCached.mode
  let mode: DashboardMode = 'off'
  try {
    if (mongoose.connection.readyState !== 1) return 'off'
    const PlatformConfig = (await import('@/models/PlatformConfig')).default
    const doc = await PlatformConfig.findById('platform').select('orgDashboard').lean<{ orgDashboard?: string }>()
    if (isDashboardMode(doc?.orgDashboard)) mode = doc.orgDashboard
  } catch {
    return 'off'
  }
  dashCached = { at: Date.now(), mode }
  return mode
}
