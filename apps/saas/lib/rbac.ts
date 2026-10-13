// ============================================================================
// rbac.ts — Matriz de permisos por rol de sede (Oleada 2 multisede)
// ============================================================================
// Fuente de verdad de qué puede hacer cada LocationRole. Las rutas consultan
// `userHasPermission` en lugar de asumir "admin = todo".
//
// Semántica (no romper lo que funciona):
//   - flag `rbac.sedeScope` off (default): `enforcePermission` NO valida nada
//     (devuelve null) — los guards de siempre (requireAuth / requireAdminRole)
//     siguen siendo la defensa y la conducta no cambia. `userHasPermission`
//     con flag off mantiene el fallback legacy (modelo de la Oleada 1).
//   - flag on: se resuelve contra `user_location_roles`
//     (fila específica de la sede; si no hay, fila tenant-wide locationId:null;
//     si no hay ninguna, se cae al fallback legacy para no dejar gente fuera).
//   - auditor = solo lectura (contador externo): jamás acciones de escritura
//     ni dinero en efectivo. Ve reservas, reportes y el consolidado.
//
// Matriz v3 (aprobada por Gonzalo, 2026-10-13) — deltas vs v2:
//   - orders.cancel queda solo admin+manager (staff y cashier lo pierden).
//     orders.write lo conservan staff, cashier, waiter y seller (solo host lo
//     pierde) — corrección de Gonzalo 2026-10-13: el cajero crea y actualiza
//     pedidos.
//   - cash.* queda solo admin+manager+cashier (staff pierde; auditor ya no lee
//     movimientos de caja: su lectura de caja es vía reports.cash/reports.read).
//   - reservations: +auditor en lectura, +cashier en escritura; nuevo
//     reservations.delete (admin+manager).
//   - reports: reports.read admin+manager+auditor (cashier y seller lo pierden);
//     nuevos reports.cash (admin+manager+cashier) y
//     reports.view_consolidated (admin+auditor).
//   - users.write y settings.write para manager (settings no-sensibles: las
//     rutas sensibles conservan requireAdminRole — admin only).
//   - nuevos admin-only: payments.configure, fiscal.configure.
//   - nuevos admin+manager: discounts.write.
//   - rooms.access para todos los roles (incluye host; contrato M4 sockets).
// ============================================================================

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import UserLocationRole, { LOCATION_ROLES, type LocationRole } from '@/models/UserLocationRole'
import { isFlagEnabled, FLAGS } from '@/lib/feature-flags'
import type { FlaggedTenant } from '@/lib/feature-flags'
import { getSessionUser, requireAuth, requireAdminRole } from '@/lib/apiAuth'

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
  | 'reservations.delete'
  | 'promotions.write'
  | 'discounts.write'
  | 'inventory.write'
  | 'reports.read'
  | 'reports.cash'
  | 'reports.view_consolidated'
  | 'audit.read'
  | 'settings.read'
  | 'settings.write'
  | 'users.read'
  | 'users.write'
  | 'printjobs.manage'
  | 'payments.configure'
  | 'fiscal.configure'
  | 'rooms.access'

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
  'reservations.delete',
  'promotions.write',
  'discounts.write',
  'inventory.write',
  'reports.read',
  'reports.cash',
  'reports.view_consolidated',
  'audit.read',
  'settings.read',
  'settings.write',
  'users.read',
  'users.write',
  'printjobs.manage',
  'payments.configure',
  'fiscal.configure',
  'rooms.access',
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
    'reservations.delete',
    'promotions.write',
    'discounts.write',
    'inventory.write',
    'reports.read',
    'reports.cash',
    'audit.read',
    'settings.read',
    'settings.write',
    'users.read',
    'users.write',
    'printjobs.manage',
    'rooms.access',
  ],
  staff: [
    'orders.read',
    'orders.write',
    'kitchen.read',
    'menu.read',
    'rooms.access',
  ],
  cashier: [
    'orders.read',
    'orders.write',
    'kitchen.read',
    'cash.open',
    'cash.close',
    'cash.movements.read',
    'cash.movements.write',
    'menu.read',
    'reservations.write',
    'reports.cash',
    'rooms.access',
  ],
  waiter: [
    'orders.read',
    'orders.write',
    'kitchen.read',
    'menu.read',
    'reservations.read',
    'reservations.write',
    'rooms.access',
  ],
  host: [
    'orders.read',
    'menu.read',
    'reservations.read',
    'reservations.write',
    'rooms.access',
  ],
  auditor: [
    'orders.read',
    'menu.read',
    'reservations.read',
    'reports.read',
    'reports.view_consolidated',
    'audit.read',
    'rooms.access',
  ],
  seller: [
    'orders.read',
    'orders.write',
    'kitchen.read',
    'menu.read',
    'rooms.access',
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
  if (role === 'host') return roleHasPermission('host', permission)
  if (role === 'auditor') return roleHasPermission('auditor', permission)
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

/**
 * Guard de ruta: 403 si no tiene el permiso. Devuelve null si está permitido.
 *
 * Flag `rbac.sedeScope` OFF (default) → devuelve null sin validar nada: la
 * conducta de la ruta queda exactamente como estaba (requireAuth /
 * requireAdminRole siguen siendo los guards). Con el flag ON valida contra la
 * matriz v3 (user_location_roles con fallback legacy).
 */
export async function enforcePermission(args: {
  user: RbacUser | null | undefined
  tenant: FlaggedTenant | null | undefined
  tenantId: string
  locationId?: string | null
  permission: Permission
}): Promise<NextResponse | null> {
  if (!isFlagEnabled(args.tenant, FLAGS.RBAC_SEDE_SCOPE)) return null
  const allowed = await userHasPermission(args)
  if (allowed) return null
  return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
}

/**
 * Enforce para rutas: resuelve la sesión del request y aplica
 * `enforcePermission`. Flag off (default) → null sin tocar la sesión
 * (la ruta queda exactamente como estaba). Llamar DESPUÉS del guard de
 * siempre (requireAuth / requireAdminRole / auth()).
 */
export async function enforcePermissionForRequest(
  request: NextRequest,
  args: {
    tenant: FlaggedTenant | null | undefined
    tenantId: string
    locationId?: string | null
    permission: Permission
  }
): Promise<NextResponse | null> {
  if (!isFlagEnabled(args.tenant, FLAGS.RBAC_SEDE_SCOPE)) return null
  const user = await getSessionUser(request)
  return enforcePermission({ user, ...args })
}

/**
 * Para rutas que hoy son admin-only (requireAdminRole) y donde la matriz v3
 * habilita también a manager bajo el flag:
 *   flag on  → requireAuth (pertenencia al tenant) + matriz v3
 *   flag off → requireAdminRole (comportamiento actual, sin cambios)
 */
export async function enforcePermissionOrAdmin(
  request: NextRequest,
  args: {
    tenant: FlaggedTenant | null | undefined
    tenantId: string
    locationId?: string | null
    permission: Permission
  }
): Promise<NextResponse | null> {
  if (isFlagEnabled(args.tenant, FLAGS.RBAC_SEDE_SCOPE)) {
    const authError = await requireAuth(request, args.tenantId)
    if (authError) return authError
    const user = await getSessionUser(request)
    return enforcePermission({ user, ...args })
  }
  return requireAdminRole(request, args.tenantId)
}
