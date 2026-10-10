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