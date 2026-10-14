// ============================================================================
// config-layers.ts — Resolución de config en 3 capas (flag config.layers)
// ============================================================================
// Capas (de menor a mayor prioridad):
//   1. system  — defaults del código / PlatformConfig
//   2. tenant  — Tenant.<campo>
//   3. location — Location.<campo> o Location.settings.<campo>
//
// Cuando el flag `config.layers` está OFF (default), la resolución sigue
// exactamente como siempre (cada consumer hace su fallback ad-hoc).
//
// Cuando está ON, `resolveSetting` devuelve el valor JUNTO con el origen
// ('system' | 'tenant' | 'location'), permitiendo que la UI muestre
// "heredado" o "propio" por campo.
// ============================================================================

import { isFlagEnabled, FLAGS } from '@/lib/feature-flags'

export type ConfigOrigin = 'system' | 'tenant' | 'location'

export interface ResolvedSetting<T> {
  value: T
  origin: ConfigOrigin
  /** true si el valor viene de una capa superior (no es "propio" de la sede) */
  inherited: boolean
}

/**
 * Configuración de una sede resuelta en 3 capas.
 * Cada campo lleva su valor + origen.
 */
export interface ResolvedLocationConfig {
  timezone: ResolvedSetting<string>
  acceptsOrders: ResolvedSetting<boolean>
  estimatedPickupTime: ResolvedSetting<number>
}

// ── Defaults del sistema (capa más baja) ──────────────────────────────

export const SYSTEM_DEFAULTS = {
  timezone: 'America/Argentina/Buenos_Aires',
  acceptsOrders: true,
  estimatedPickupTime: 20,
} as const

// ── Resolver genérico ─────────────────────────────────────────────────

/**
 * Resuelve un setting en 3 capas con origin tracking.
 *
 * @param flagEnabled - resultado de isFlagEnabled(tenant, FLAGS.CONFIG_LAYERS)
 * @param systemValue - valor del sistema (default)
 * @param tenantValue - valor del tenant (null/undefined = no seteado)
 * @param locationValue - valor de la sede (null/undefined = no seteado)
 */
export function resolveSetting<T>(
  flagEnabled: boolean,
  systemValue: T,
  tenantValue: T | null | undefined,
  locationValue: T | null | undefined
): ResolvedSetting<T> {
  // Flag OFF: comportamiento legacy — location → system (sin tenant layer)
  if (!flagEnabled) {
    if (locationValue !== null && locationValue !== undefined) {
      return { value: locationValue, origin: 'location', inherited: false }
    }
    return { value: systemValue, origin: 'system', inherited: true }
  }

  // Flag ON: 3 capas completas
  if (locationValue !== null && locationValue !== undefined) {
    return { value: locationValue, origin: 'location', inherited: false }
  }
  if (tenantValue !== null && tenantValue !== undefined) {
    return { value: tenantValue, origin: 'tenant', inherited: true }
  }
  return { value: systemValue, origin: 'system', inherited: true }
}

// ── Resolución de config completa de una sede ─────────────────────────

interface LocationConfigInput {
  timezone?: string | null
  settings?: {
    acceptsOrders?: boolean | null
    estimatedPickupTime?: number | null
  } | null
}

interface TenantConfigInput {
  timezone?: string | null
  settings?: {
    acceptsOrders?: boolean | null
    estimatedPickupTime?: number | null
  } | null
}

/**
 * Resuelve la config efectiva de una sede en 3 capas.
 * Retorna cada campo con su valor y origen.
 */
export function resolveLocationConfig(params: {
  flagEnabled: boolean
  systemDefaults?: Partial<typeof SYSTEM_DEFAULTS>
  tenant: TenantConfigInput | null | undefined
  location: LocationConfigInput | null | undefined
}): ResolvedLocationConfig {
  const { flagEnabled, systemDefaults, tenant, location } = params
  const sys = { ...SYSTEM_DEFAULTS, ...systemDefaults }

  return {
    timezone: resolveSetting(
      flagEnabled,
      sys.timezone,
      tenant?.timezone ?? null,
      location?.timezone ?? null
    ),
    acceptsOrders: resolveSetting(
      flagEnabled,
      sys.acceptsOrders,
      tenant?.settings?.acceptsOrders ?? null,
      location?.settings?.acceptsOrders ?? null
    ),
    estimatedPickupTime: resolveSetting(
      flagEnabled,
      sys.estimatedPickupTime,
      tenant?.settings?.estimatedPickupTime ?? null,
      location?.settings?.estimatedPickupTime ?? null
    ),
  }
}

/**
 * Helper rápido: resuelve solo el timezone de una sede.
 * Flag OFF → location.timezone ?? DEFAULT (comportamiento actual).
 * Flag ON  → location → tenant → system, con origin.
 */
export function resolveTimezone(
  tenant: TenantConfigInput | null | undefined,
  location: LocationConfigInput | null | undefined,
  flagEnabled?: boolean
): ResolvedSetting<string> {
  const enabled = flagEnabled ?? isFlagEnabled(tenant as never, FLAGS.CONFIG_LAYERS)
  return resolveSetting(
    enabled,
    SYSTEM_DEFAULTS.timezone,
    tenant?.timezone ?? null,
    location?.timezone ?? null
  )
}

/**
 * Formatea el origen para mostrar en UI.
 * 'location' → "Propio", 'tenant'/'system' → "Heredado"
 */
export function originLabel(origin: ConfigOrigin): string {
  return origin === 'location' ? 'Propio' : 'Heredado'
}
