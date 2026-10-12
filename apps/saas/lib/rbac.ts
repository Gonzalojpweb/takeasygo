// ============================================================================
// rbac.ts — Matriz de permisos por rol de sede (Oleada 2 multisede)
// ============================================================================
// Fuente de verdad de qué puede hacer cada LocationRole. Las rutas consultan
// `userHasPermission` en lugar de asumir "admin = todo".
//
// Semántica (no romper lo que funciona):
//   - flag `rbac.sedeScope` off (default): fallback al modelo actual
//     (superadmin total; user sin assignedLocations = total; con scope =
//     solo sus sedes; permisos según User.role legacy).
//   - flag on: se resuelve contra `user_location_roles`
//     (fila específica de la sede; si no hay, fila tenant-wide locationId:null;
//     si no hay ninguna, se cae al fallback legacy para no dejar gente fuera).
//   - auditor = solo lectura (contador externo): jamás acciones de escritura
//     ni dinero en efectivo (solo lectura de movimientos).
// ============================================================================

import { NextResponse } from 'next/server'
import UserLocationRole, { LOCATION_ROLES, type LocationRole } from '@/models/UserLocationRole'
import { isFlagEnabled, FLAGS } from '@/lib/feature-flags'
import type { FlaggedTenant } from '@/lib/feature-flags'

/** Acciones canónicas del dominio restaurant/SaaS. */
export type Permission =
  | 'orders.read'
  | 'orders.write'
  | 'orders.cancel'
  | 'kitchen.read'
  | 'cash.open'
  | 'cash.close'
  | 'cash.movements.read'
  | 'cash.movements.write'
  | 'menu.read'
  | 'menu.write'
  | 'reservations.read'
  | 'reservations.write'
  | 'promotions.write'
  | 'inventory.write'
  | 'reports.read'
  | 'audit.read'
  | 'settings.read'
  | 'settings.write'
  | 'users.read'
  | 'users.write'
  | 'printjobs.manage'

const ALL_PERMISSIONS: Permission[] = [
  'orders.read',
  'orders.write',
  'orders.cancel',
  'kitchen.read',
  'cash.open',
  'cash.close',
  'cash.movements.read',
  'cash.movements.write',
  'menu.read',
  'menu.write',
  'reservations.read',
  'reservations.write',
  'promotions.write',
  'inventory.write',
  'reports.read',
  'audit.read',
  'settings.read',
  'settings.write',
  'users.read',
  'users.write',
  'printjobs.manage',
]

/**
 * Matriz por rol de sede. Ajustable con Gonzalo sin tocar rutas:
 * solo cambia este objeto.
 */
export const ROLE_PERMISSIONS: Record<LocationRole, readonly Permission[]> = {
  admin: ALL_PERMISSIONS,
  manager: [
    'orders.read',
    'orders.write',
    'orders.cancel',
    'kitchen.read',
    'cash.open',
    'cash.close',
    'cash.movements.read',
    'cash.movements.write',
    'menu.read',
    'menu.write',
    'reservations.read',
    'reservations.write',
    'promotions.write',
    'inventory.write',
    'reports.read',
    'audit.read',
    'settings.read',
    'users.read',
    'printjobs.manage',
  ],
  staff: [
    'orders.read',
    'orders.write',
    'orders.cancel',
    'kitchen.read',
    'cash.open',
    'cash.movements.read',
    'cash.movements.write',
    'menu.read',
  ],
  cashier: [
    'orders.read',
    'orders.cancel',
    'kitchen.read',
    'cash.open',
    'cash.close',
    'cash.movements.read',
    'cash.movements.write',
    'menu.read',
    'reports.read',
  ],
  waiter: [
    'orders.read',
    'orders.write',
    'kitchen.read',
    'menu.read',
    'reservations.read',
  ],
  host: [
    'orders.read',
    'menu.read',
    'reservations.read',
    'reservations.write',
  ],
  auditor: [
    'orders.read',
    'menu.read',
    'cash.movements.read',
    'reports.read',
    'audit.read',
    'settings.read',
  ],
  seller: [
    'orders.read',
    'orders.write',
    'kitchen.read',
    'menu.read',
    'reports.read',
  ],
}

const ROLE_PERMISSION_SETS = Object.fromEntries(
  LOCATION_ROLES.map(r => [r, new Set(ROLE_PERMISSIONS[r])])
) as unknown as Record<LocationRole, ReadonlySet<Permission>>

export function roleHasPermission(role: string | null | undefined, permission: Permission): boolean {
  if (!role || !(role in ROLE_PERMISSION_SETS)) return false
  return ROLE_PERMISSION_SETS[role as LocationRole].has(permission)
}

/** Usuario con el shape de apiAuth (role + assignedLocations). */
export interface RbacUser {
  _id?: unknown
  id?: unknown
  role?: string | null
  assignedLocations?: Array<string | unknown> | null
}

function userIdString(user: RbacUser): string | null {
  const raw = user._id ?? user.id
  if (!raw) return null
  return String(raw)
}

function locationIds(user: RbacUser): string[] {
  return (user.assignedLocations ?? []).map(l => String(l))
}

/**
 * Fallback legacy (flag off o sin fila en user_location_roles):
 * mismas reglas que location-scope/apiAuth de la Oleada 1.
 */
export function legacyHasPermission(user: RbacUser, permission: Permission): boolean {
  if (!user) return false
  if (user.role === 'superadmin') return true
  const role = user.role
  if (role === 'admin') return true
  if (role === 'manager') return roleHasPermission('manager', permission)
  if (role === 'staff') return roleHasPermission('staff', permission)
  if (role === 'cashier') return roleHasPermission('cashier', permission)
  if (role === 'waiter') return roleHasPermission('waiter', permission)
  if (role === 'seller') return roleHasPermission('seller', permission)
  return false
}

/**
 * ¿El usuario tiene `permission` en `tenantId` para `locationId` (o para el
 * tenant entero si locationId es null)?
 *
 * Con el flag off o sin datos en user_location_roles devuelve el resultado
 * legacy (no cambia conducta). Lanza si se usa con flag on y falla la DB —
 * las rutas que la usan ya manejan errores.
 */
export async function userHasPermission(args: {
  user: RbacUser | null | undefined
  tenant: FlaggedTenant | null | undefined
  tenantId: string
  locationId?: string | null
  permission: Permission
}): Promise<boolean> {
  const { user, tenant, tenantId, locationId, permission } = args
  if (!user) return false
  if (user.role === 'superadmin') return true

  const flagOn = isFlagEnabled(tenant, FLAGS.RBAC_SEDE_SCOPE)
  if (!flagOn) {
    // Fallback legacy + alcance de sede de la Oleada 1.
    if (locationId) {
      const scoped = locationIds(user)
      if (scoped.length > 0 && !scoped.includes(String(locationId))) return false
    }
    return legacyHasPermission(user, permission)
  }

  const uid = userIdString(user)
  if (!uid) return false

  const query: Record<string, unknown> = {
    tenantId,
    userId: uid,
    isActive: true,
    role: { $in: LOCATION_ROLES },
  }
  if (locationId) {
    // Preferencia: fila de la sede; si no, fila tenant-wide.
    query.locationId = { $in: [locationId, null] }
  } else {
    query.locationId = null
  }

  const rows = await UserLocationRole.find(query).lean()
  if (rows.length > 0) {
    // Si hay fila de sede específica y tenant-wide, gana la más restrictiva
    // de las que matchean la acción.
    return rows.some(r => roleHasPermission(r.role, permission))
  }

  // Sin fila: fallback legacy para no cortar el acceso de nadie durante el rollout.
  if (locationId) {
    const scoped = locationIds(user)
    if (scoped.length > 0 && !scoped.includes(String(locationId))) return false
  }
  return legacyHasPermission(user, permission)
}

/** Guard de ruta: 403 si no tiene el permiso. Devuelve null si está permitido. */
export async function enforcePermission(args: {
  user: RbacUser | null | undefined
  tenant: FlaggedTenant | null | undefined
  tenantId: string
  locationId?: string | null
  permission: Permission
}): Promise<NextResponse | null> {
  const allowed = await userHasPermission(args)
  if (allowed) return null
  return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
}
