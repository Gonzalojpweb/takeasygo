import mongoose from 'mongoose'
import { flagDbReady } from '@/lib/flag-db'
import type { ShadowReason } from '@/models/AccessShadowEvent'

// ============================================================================
// Interruptor de plataforma `access.central` (multi-marca, PR 2 — 06/11/2026)
// ============================================================================
//   off     → decide el JWT, como siempre (valor por defecto).
//   log     → decide el JWT; además se calcula la decisión con el usuario de
//             la base y, si difieren, se registra (AccessShadowEvent).
//   enforce → decide el usuario de la base (rol, comercio y estado frescos:
//             un usuario desactivado o al que le quitaron el rol pierde el
//             acceso en ≤ 30 s, no en 8 h).
// Fuente: variable ACCESS_CENTRAL_MODE (emergencia, manda) o
// PlatformConfig.accessCentral (lo cambia el superadmin sin redeploy).
// Caché de 15 s por instancia. Sin base conectada: `off` (falla cerrado al
// comportamiento conocido, nunca abre algo nuevo).
// ============================================================================

export type AccessMode = 'off' | 'log' | 'enforce'
const MODES: readonly AccessMode[] = ['off', 'log', 'enforce']
const TTL_MS = 15_000

let cached: { at: number; mode: AccessMode } | null = null

export function isAccessMode(value: unknown): value is AccessMode {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value)
}

/** Solo para tests y para el cambio desde el superadmin. */
export function clearAccessModeCache(): void {
  cached = null
}

export async function getAccessMode(): Promise<AccessMode> {
  const env = process.env.ACCESS_CENTRAL_MODE?.trim().toLowerCase()
  if (isAccessMode(env)) return env
  if (cached && Date.now() - cached.at < TTL_MS) return cached.mode
  let mode: AccessMode = 'off'
  try {
    // Instancia recién arrancada: conecta primero (flag-db). Si no puede,
    // `off` sin guardarlo: se reintenta en la próxima lectura.
    if (!(await flagDbReady())) return 'off'
    const PlatformConfig = (await import('@/models/PlatformConfig')).default
    const doc = await PlatformConfig.findById('platform').select('accessCentral').lean<{ accessCentral?: string }>()
    if (isAccessMode(doc?.accessCentral)) mode = doc.accessCentral
  } catch {
    return 'off' // falla cerrado, sin guardar: se reintenta en la próxima lectura
  }
  cached = { at: Date.now(), mode }
  return mode
}

export interface ShadowInput {
  family: string
  route?: string | null
  userId?: string | null
  tenantId?: string | null
  oldDecision: boolean
  newDecision: boolean
  oldRole?: string | null
  newRole?: string | null
  /** Datos para clasificar el motivo. */
  hadJwt: boolean
  freshFound: boolean
  oldTenantMatches?: boolean
  newTenantMatches?: boolean
  /** Motivo ya conocido por quien registra (p. ej. org_membership); salta la clasificación. */
  reason?: ShadowReason
}

/**
 * Motivo determinista de la divergencia. `unknown` es lo que hay que mirar:
 * el criterio para pasar a `enforce` es 7 días sin ningún `unknown`.
 */
export function classifyShadow(i: ShadowInput): ShadowReason {
  if (!i.hadJwt) return 'no_jwt'
  if (!i.freshFound) return 'user_inactive'
  if (i.oldTenantMatches !== undefined && i.newTenantMatches !== undefined && i.oldTenantMatches !== i.newTenantMatches) return 'jwt_stale_tenant'
  if ((i.oldRole ?? null) !== (i.newRole ?? null)) return 'jwt_stale_role'
  return 'unknown'
}

/** Registra una divergencia. Nunca lanza ni demora la respuesta. */
export function recordShadow(i: ShadowInput): void {
  if (i.oldDecision === i.newDecision) return
  const reason = i.reason ?? classifyShadow(i)
  void (async () => {
    try {
      if (mongoose.connection.readyState !== 1) return
      const AccessShadowEvent = (await import('@/models/AccessShadowEvent')).default
      await AccessShadowEvent.create({
        family: i.family.slice(0, 60),
        route: i.route ? i.route.slice(0, 200) : null,
        userId: i.userId ?? null,
        tenantId: i.tenantId ?? null,
        oldDecision: i.oldDecision,
        newDecision: i.newDecision,
        oldRole: i.oldRole ?? null,
        newRole: i.newRole ?? null,
        reason,
      })
    } catch (err) {
      console.warn('[access-central] no se pudo registrar la divergencia:', (err as Error)?.message)
    }
  })()
}
