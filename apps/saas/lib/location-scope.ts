// ============================================================================
// location-scope.ts — Aislamiento por sede (Oleada 1)
// ============================================================================
// Guard minimalista que cierra el hueco actual: hoy las rutas validan que la
// sede exista y sea del tenant, pero NO que el usuario tenga permiso sobre esa
// sede. Un usuario scoped a L1 puede crear/leer datos de L2 pasando el
// locationId.
//
// Semántica (consistente con apps/saas/lib/apiAuth.ts):
//   - superadmin => acceso total
//   - user sin assignedLocations (single-sede legacy / rol de tenant) => total
//   - user con assignedLocations => debe incluir la sede solicitada
//
// Diseñado para la regla "no romper lo que funciona": devuelve null (permitir)
// cuando no hay locationId, y no modifica el comportamiento de tenants con 1
// sede ni de usuarios sin scope.
//
// Nota: en Oleada 2 esto se migra a `UserRole`/`user_location_roles`
// (rol + alcance por sede y por tenant). Este guard queda como capa de defensa.
// ============================================================================

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export interface LocationScopeUser {
  role?: string | null
  assignedLocations?: string[] | null
}

export function canAccessLocation(
  user: LocationScopeUser | null | undefined,
  locationId: string
): boolean {
  if (!user) return false
  if (user.role === 'superadmin') return true
  const locations = user.assignedLocations ?? []
  if (locations.length === 0) return true
  return locations.includes(locationId)
}

export function enforceLocationScope(
  user: LocationScopeUser | null | undefined,
  locationId: string | null | undefined
): NextResponse | null {
  if (locationId && !canAccessLocation(user, locationId)) {
    return NextResponse.json(
      { error: 'Acceso denegado a esta sede' },
      { status: 403 }
    )
  }
  return null
}

/**
 * Guard para recursos YA cargados (reserva, pedido, caja…) cuya sede no viene
 * del request sino del documento: si el usuario no tiene alcance sobre esa
 * sede responde 404 (no 403) para no filtrar la existencia del recurso.
 * Siempre activo, sin flag: un usuario con sedes asignadas nunca debe operar
 * recursos de otra sede.
 */
export function guardResourceLocation(
  user: LocationScopeUser | null | undefined,
  resourceLocationId: unknown,
  notFoundMessage = 'No encontrado'
): NextResponse | null {
  if (!resourceLocationId) return null
  if (canAccessLocation(user, String(resourceLocationId))) return null
  return NextResponse.json({ error: notFoundMessage }, { status: 404 })
}

/**
 * Igual que `guardResourceLocation` pero resolviendo la sesión del request.
 * Para rutas admin que reciben la sede en body/query (menú, promociones,
 * inventario…): un usuario con sedes asignadas no opera otra sede.
 */
export async function guardRequestLocation(
  request: NextRequest,
  locationId: unknown,
  notFoundMessage = 'No encontrado'
): Promise<NextResponse | null> {
  if (!locationId) return null
  const { getSessionUser } = await import('@/lib/apiAuth')
  const user = await getSessionUser(request)
  return guardResourceLocation(user, locationId, notFoundMessage)
}

/**
 * Recursos "compartidos con override" (p. ej. promociones): `locationId`
 * null = aplica a todas las sedes. Solo un usuario de tenant (sin sedes
 * asignadas) opera los compartidos; uno de sede, solo los de sus sedes.
 */
export async function guardSharedOrLocation(
  request: NextRequest,
  locationId: unknown,
  notFoundMessage = 'No encontrado'
): Promise<NextResponse | null> {
  const { getSessionUser } = await import('@/lib/apiAuth')
  const user = await getSessionUser(request)
  if (locationId) return guardResourceLocation(user, locationId, notFoundMessage)
  if (!user) return NextResponse.json({ error: notFoundMessage }, { status: 404 })
  const scoped = user.role !== 'superadmin' && (user.assignedLocations ?? []).length > 0
  return scoped ? NextResponse.json({ error: notFoundMessage }, { status: 404 }) : null
}

/** Filtro para listados/lotes: sedes del usuario, o null si es de tenant. */
export async function scopedLocationIds(request: NextRequest): Promise<string[] | null> {
  const { getSessionUser } = await import('@/lib/apiAuth')
  const user = await getSessionUser(request)
  if (!user || user.role === 'superadmin') return null
  const locs = (user.assignedLocations ?? []).map(String)
  return locs.length > 0 ? locs : null
}

/**
 * Registra (sin bloquear) un intento cross-sede. Se usa en modo `log` del flag
 * `multisede.strictLocationId`: deja evidencia para medir falsos positivos
 * antes de endurecer a `enforce`.
 */
export function logScopeAllowed(context: {
  route: string
  tenant?: string
  locationId?: string | null
  userId?: string | null
  role?: string | null
}): void {
  // eslint-disable-next-line no-console
  console.warn('[multisede][log] intento cross-sede (permitido, modo log)', JSON.stringify(context))
}