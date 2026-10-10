// ============================================================================
// feature-flags.ts — Feature flags por tenant (Oleada 1 multisede)
// ============================================================================
// No existía un mecanismo de feature flags en el SaaS (solo env + PlatformConfig
// booleans como maintenanceMode). Este helper agrega flags **por tenant**, que es
// lo que pide el plan multisede: activar por tenant en staging, medir, y recién
// después encender en producción.
//
// Precedencia (de mayor a menor):
//   1. Env de emergencia  (process.env[ENV_PREFIX + KEY])  -> fuerza on/off global
//   2. tenant.flags[key]  (por tenant, en DB)
//   3. defaultValue       (sin-cambio: mantiene el comportamiento actual)
//
// Regla de oro: el default es SIEMPRE `false` (o el comportamiento actual). Un
// tenant, o un flag ausente, jamás cambia conducta por el solo hecho de existir
// este helper.
// ============================================================================

/**
 * Catálogo de flags multisede. Mantener las claves "dotted" (namespace.accion)
// para que `tenant.flags` sea un mapa plano sin colisiones.
 */
export const FLAGS = {
  /** Si está ON, las rutas validan que el user tenga permiso sobre el locationId
   *  solicitado (403 si la sede es ajena). Off = comportamiento actual. */
  STRICT_LOCATION_ID: 'multisede.strictLocationId',
  /** Reservado Oleada 2: habilita el modelo de roles por sede (user_location_roles). */
  RBAC_SEDE_SCOPE: 'rbac.sedeScope',
  /** Config en 3 capas system -> tenant -> sede (Location.settings override). */
  CONFIG_LAYERS: 'config.layers',
} as const

export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS]

/**
 * Modo de un flag de aislamiento (3 valores):
 *   - `off`     : comportamiento actual (no valida).
 *   - `log`     : valida y **registra** el intento cross-sede, pero NO bloquea.
 *                 Permite medir falsos positivos antes de endurecer.
 *   - `enforce` : valida y bloquea (403 / filtro de listado).
 */
export type FlagMode = 'off' | 'log' | 'enforce'

export type TenantFlags = Record<string, boolean | string | number | null | undefined>

export interface FlaggedTenant {
  flags?: TenantFlags | null
}

const ENV_PREFIX = 'NEXT_PUBLIC_FF_'

/**
 * Lee el override de entorno para una flag. Devuelve undefined si no está
 * definido (para caer al nivel siguiente). Acepta 'true'/'1'/'on' = on y
 * 'false'/'0'/'off' = off (case-insensitive).
 */
function envOverride(flag: string): boolean | undefined {
  const raw = process.env[ENV_PREFIX + flag]
  if (raw === undefined || raw === null || raw === '') return undefined
  const normalized = raw.trim().toLowerCase()
  if (['true', '1', 'on', 'yes'].includes(normalized)) return true
  if (['false', '0', 'off', 'no'].includes(normalized)) return false
  return undefined
}

/**
 * Resuelve una flag booleana para un tenant. `tenant` puede ser un documento
 * Mongoose o un objeto plano (`.lean()`), ya que `flags` es un campo Mixed.
 */
export function isFlagEnabled(
  tenant: FlaggedTenant | null | undefined,
  flag: string,
  defaultValue = false
): boolean {
  const env = envOverride(flag)
  if (env !== undefined) return env

  const raw = tenant?.flags?.[flag]
  if (raw === undefined || raw === null) return defaultValue
  if (typeof raw === 'boolean') return raw
  return raw === 'true' || raw === 1 || raw === '1'
}

/** Conveniencia tipada para la flag de aislamiento estricto por sede. */
export function isStrictLocationIdEnabled(tenant: FlaggedTenant | null | undefined): boolean {
  return getStrictLocationIdMode(tenant) !== 'off'
}

/**
 * Lee el override de entorno para una flag de modo. Acepta `off`/`log`/`enforce`
 * (case-insensitive) y, por compatibilidad, `false`/`off` => off y
 * `true`/`on` => enforce.
 */
function envModeOverride(flag: string): FlagMode | undefined {
  const raw = process.env[ENV_PREFIX + flag]
  if (raw === undefined || raw === null || raw === '') return undefined
  return normalizeMode(raw)
}

/** Normaliza un valor crudo (boolean/string/number) a un `FlagMode`. */
function normalizeMode(raw: unknown): FlagMode | undefined {
  if (typeof raw === 'boolean') return raw ? 'enforce' : 'off'
  if (typeof raw === 'number') {
    if (raw === 0) return 'off'
    if (raw === 1) return 'enforce'
    return undefined
  }
  const n = String(raw).trim().toLowerCase()
  if (n === 'enforce' || n === 'true' || n === 'on' || n === 'yes' || n === '1') return 'enforce'
  if (n === 'log') return 'log'
  if (n === 'off' || n === 'false' || n === 'no' || n === '0') return 'off'
  return undefined
}

/**
 * Resuelve un flag de modo para un tenant. Misma precedencia que `isFlagEnabled`:
 *   env de emergencia > tenant.flags[key] > defaultMode ('off' por defecto).
 *
 * Retrocompatibilidad: un flag booleano `true` se interpreta como `enforce`
 * (comportamiento previo) y `false` como `off`.
 */
export function getFlagMode(
  tenant: FlaggedTenant | null | undefined,
  flag: string,
  defaultMode: FlagMode = 'off'
): FlagMode {
  const env = envModeOverride(flag)
  if (env !== undefined) return env

  const raw = tenant?.flags?.[flag]
  if (raw === undefined || raw === null) return defaultMode
  return normalizeMode(raw) ?? defaultMode
}

/** Modo del flag de aislamiento estricto por sede (`off` | `log` | `enforce`). */
export function getStrictLocationIdMode(tenant: FlaggedTenant | null | undefined): FlagMode {
  return getFlagMode(tenant, FLAGS.STRICT_LOCATION_ID, 'off')
}
