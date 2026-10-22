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
//     reservations.delete (admin+manager). El mozo (waiter) SOLO lee
//     reservas — corrección Gonzalo 2026-10-13: pierde reservations.write
//     (la creación es endpoint público, no requiere permiso de rol).
//   - reports: reports.read admin+manager+auditor (cashier y seller lo pierden);
//     nuevos reports.cash (admin+manager+cashier) y
//     reports.view_consolidated (admin+auditor). El consolidado es de ÁMBITO
//     TENANT: exige fila ULR tenant-wide (locationId:null); un auditor de una
//     sola sede no lo ve (corrección Gonzalo 2026-10-13).
//   - users.write y settings.write para manager (settings no-sensibles: las
//     rutas sensibles conservan requireAdminRole — admin only).
//   - nuevos admin-only: payments.configure, fiscal.configure.
//   - nuevos admin+manager: discounts.write.
//   - rooms.access para todos los roles (incluye host; contrato M4 sockets).
//
// Inventario (aprobado por Gonzalo, 2026-10-21):
//   - inventory.* SOLO admin, manager y los roles de back-office nuevos:
//     operations_manager (Gerente de operaciones) y kitchen_lead (Jefe de
//     cocina). staff y cashier pierden inventory.capture; el mozo nunca lo
//     tuvo. Quien vende alimenta el inventario vendiendo, no cargándolo.
//   - kitchen_lead tiene inventory.write para recetas; el guard de inventario
//     (lib/inventory/route.ts) le niega igual la capacidad 'manage'
//     (activar sede, depósitos, ajustes, transferencias).
// ============================================================================

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import UserLocationRole, { LOCATION_ROLES, type LocationRole } from '@/models/UserLocationRole'
import { getFlagMode, FLAGS, type FlagMode } from '@/lib/feature-flags'
import type { FlaggedTenant } from '@/lib/feature-flags'
import { getSessionUser, requireAuth, requireAdminRole } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

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
  | 'inventory.read'
  | 'inventory.capture'
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
  'inventory.read',
  'inventory.capture',
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
    'inventory.read',
    'inventory.capture',
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
  operations_manager: [
    'orders.read',
    'kitchen.read',
    'menu.read',
    'inventory.read',
    'inventory.capture',
    'inventory.write',
    'rooms.access',
  ],
  kitchen_lead: [
    'orders.read',
    'kitchen.read',
    'menu.read',
    'inventory.read',
    'inventory.capture',
    'inventory.write',
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
    // Corrección Gonzalo 2026-10-13: el mozo SOLO ve reservas (lectura).
    // No tiene reservations.write (actualizar estado) ni delete. La creación
    // de reservas es endpoint público (POST /reservas) y no requiere permiso
    // de rol, así que no hay un "crear" de rol que separar del "actualizar".
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
    'inventory.read',
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

/**
 * Permisos de ÁMBITO TENANT: solo se conceden con una fila ULR tenant-wide
 * (locationId:null). Una fila de sede específica NO los otorga y NO hay
 * fallback legacy para ellos. Motivo: el consolidado (reports.view_consolidated)
 * cruza datos de TODAS las sedes — un rol asignado a una sola sede (p.ej. un
 * auditor de Recoleta) no debe ver los números del tenant entero.
 */
const TENANT_WIDE_PERMISSIONS: ReadonlySet<Permission> = new Set(['reports.view_consolidated'])

export function roleHasPermission(role: string | null | undefined, permission: Permission): boolean {
  if (!role || !(role in ROLE_PERMISSION_SETS)) return false
  return ROLE_PERMISSION_SETS[role as LocationRole].has(permission)
}

/**
 * Modo del flag `rbac.sedeScope` (sombra): `off` | `log` | `enforce`.
 *
 *   - off     : sin validación (comportamiento previo, guards de siempre).
 *   - log     : valida con la MISMA lógica que enforce (fila ULR + fallback)
 *               pero NO bloquea: la denegación simulada queda registrada en
 *               bitácora (`rbac.shadow_denied`) + console para revisar el uso
 *               real antes de pasar a enforce.
 *   - enforce : valida y bloquea (403).
 */
export function getRbacScopeMode(tenant: FlaggedTenant | null | undefined): FlagMode {
  return getFlagMode(tenant, FLAGS.RBAC_SEDE_SCOPE, 'off')
}

/** Usuario con el shape de apiAuth (role + assignedLocations). */
export interface RbacUser {
  _id?: unknown
  id?: unknown
  role?: string | null
  assignedLocations?: Array<string | unknown> | null
  name?: string | null
  email?: string | null
}

function userIdString(user: RbacUser | null | undefined): string | null {
  const raw = user?._id ?? user?.id
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
  if (role === 'operations_manager') return roleHasPermission('operations_manager', permission)
  if (role === 'kitchen_lead') return roleHasPermission('kitchen_lead', permission)
  if (role === 'staff') return roleHasPermission('staff', permission)
  if (role === 'cashier') return roleHasPermission('cashier', permission)
  if (role === 'waiter') return roleHasPermission('waiter', permission)
  if (role === 'seller') return roleHasPermission('seller', permission)
  if (role === 'host') return roleHasPermission('host', permission)
  if (role === 'auditor') return roleHasPermission('auditor', permission)
  return false
}

/**
 * Decisión de permiso con detalle — lo que usa el modo sombra para registrar
 * QUÉ rol efectivo causó la denegación (fila ULR o legacy de sesión), no solo
 * el rol del token.
 */
export interface PermissionDecision {
  allowed: boolean
  /** Rol efectivo que determinó la decisión (fila ULR; o rol de sesión en legacy). */
  effectiveRole: string | null
  /** Cómo se resolvió (para diagnóstico del reporte de sombra). */
  via: 'superadmin' | 'ulr' | 'sin-fila-legacy' | 'sin-usuario'
}

/**
 * ¿El usuario tiene `permission` en `tenantId` para `locationId` (o para el
 * tenant entero si locationId es null)? Versión con detalle; `userHasPermission`
 * es el wrapper booleano.
 *
 * Con el flag off o sin datos en user_location_roles devuelve el resultado
 * legacy (no cambia conducta). Lanza si se usa con flag on y falla la DB —
 * las rutas que la usan ya manejan errores.
 */
export async function resolvePermission(args: {
  user: RbacUser | null | undefined
  tenant: FlaggedTenant | null | undefined
  tenantId: string
  locationId?: string | null
  permission: Permission
}): Promise<PermissionDecision> {
  const { user, tenant, tenantId, locationId, permission } = args
  if (!user) return { allowed: false, effectiveRole: null, via: 'sin-usuario' }
  if (user.role === 'superadmin') return { allowed: true, effectiveRole: 'superadmin', via: 'superadmin' }

  const flagOn = getRbacScopeMode(tenant) !== 'off'
  if (!flagOn) {
    // Fallback legacy + alcance de sede de la Oleada 1.
    let allowed = true
    if (locationId) {
      const scoped = locationIds(user)
      if (scoped.length > 0 && !scoped.includes(String(locationId))) allowed = false
    }
    if (allowed) allowed = legacyHasPermission(user, permission)
    return { allowed, effectiveRole: user.role ?? null, via: 'sin-fila-legacy' }
  }

  const uid = userIdString(user)
  if (!uid) return { allowed: false, effectiveRole: null, via: 'sin-usuario' }

  // Permisos de ámbito tenant (consolidado): requieren fila ULR tenant-wide.
  // Una fila de sede específica no los concede y no hay fallback legacy.
  if (TENANT_WIDE_PERMISSIONS.has(permission)) {
    const tenantRows = await UserLocationRole.find({
      tenantId,
      userId: uid,
      isActive: true,
      locationId: null,
      role: { $in: LOCATION_ROLES },
    }).lean()
    return {
      allowed: tenantRows.some(r => roleHasPermission(r.role, permission)),
      effectiveRole: tenantRows.map(r => r.role).join('/') || null,
      via: 'ulr',
    }
  }

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
    return {
      allowed: rows.some(r => roleHasPermission(r.role, permission)),
      effectiveRole: rows.map(r => r.role).join('/'),
      via: 'ulr',
    }
  }

  // Sin fila: fallback legacy para no cortar el acceso de nadie durante el rollout.
  let allowed = true
  if (locationId) {
    const scoped = locationIds(user)
    if (scoped.length > 0 && !scoped.includes(String(locationId))) allowed = false
  }
  if (allowed) allowed = legacyHasPermission(user, permission)
  return { allowed, effectiveRole: user.role ?? null, via: 'sin-fila-legacy' }
}

export async function userHasPermission(args: {
  user: RbacUser | null | undefined
  tenant: FlaggedTenant | null | undefined
  tenantId: string
  locationId?: string | null
  permission: Permission
}): Promise<boolean> {
  return (await resolvePermission(args)).allowed
}

/**
 * Guard de ruta: 403 si no tiene el permiso. Devuelve null si está permitido.
 *
 * Flag `rbac.sedeScope` OFF (default) → devuelve null sin validar nada: la
 * conducta de la ruta queda exactamente como estaba (requireAuth /
 * requireAdminRole siguen siendo los guards). Con el flag ON valida contra la
 * matriz v3 (user_location_roles con fallback legacy).
 *
 * Modo `log` (sombra): si el permiso se DENEGARÍA, deja registro en bitácora
 * (`rbac.shadow_denied`) + console y devuelve null (no bloquea). El reporte
 * previo a enforce se arma con esos registros.
 */
export async function enforcePermission(args: {
  user: RbacUser | null | undefined
  tenant: FlaggedTenant | null | undefined
  tenantId: string
  locationId?: string | null
  permission: Permission
  /** Ruta del request (para el registro en modo sombra). */
  route?: string
}): Promise<NextResponse | null> {
  const mode = getRbacScopeMode(args.tenant)
  if (mode === 'off') return null

  const decision = await resolvePermission(args)
  if (decision.allowed) return null

  if (mode === 'log') {
    await logShadowDenial(args, decision)
    return null
  }
  return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
}

/**
 * Registro de una denegación SIMULADA (modo `log` de rbac.sedeScope).
 * Nunca lanza: logAudit ya traga errores de DB.
 *
 * `userRole` de la bitácora = rol de la SESIÓN (token). `details.effectiveRole`
 * = rol efectivo que causó la denegación (fila ULR si existe) — es el que usa
 * el reporte de sombra para agrupar.
 */
async function logShadowDenial(
  args: {
    user: RbacUser | null | undefined
    tenantId: string
    locationId?: string | null
    permission: Permission
    route?: string
  },
  decision: PermissionDecision
): Promise<void> {
  const userId = userIdString(args.user)
  const role = args.user?.role ?? ''
  const route = args.route ?? 'unknown'

  console.warn(
    '[rbac][sombra] DENEGACIÓN SIMULADA (modo log, no bloquea)',
    JSON.stringify({
      route,
      permission: args.permission,
      locationId: args.locationId ?? null,
      userId,
      role,
      effectiveRole: decision.effectiveRole,
      via: decision.via,
    })
  )

  await logAudit({
    tenantId: args.tenantId,
    action: 'rbac.shadow_denied',
    entity: 'permission',
    locationId: args.locationId ?? null,
    details: {
      route,
      permission: args.permission,
      role,
      effectiveRole: decision.effectiveRole,
      via: decision.via,
    },
    // Pasado explícitamente: evita que logAudit llame a auth() (rutas con
    // Bearer POS no tienen sesión NextAuth).
    userId: userId ?? null,
    userName: args.user?.name ?? args.user?.email ?? '',
    userRole: role,
  })
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
  const mode = getRbacScopeMode(args.tenant)
  if (mode === 'off') return null
  const user = await getSessionUser(request)
  return enforcePermission({ user, ...args, route: request.nextUrl.pathname })
}

/**
 * Para rutas que hoy son admin-only (requireAdminRole) y donde la matriz v3
 * habilita también a manager bajo el flag:
 *   flag on  → requireAuth (pertenencia al tenant) + matriz v3
 *              (modo `log`: la denegación simulada se registra y NO bloquea)
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
  if (getRbacScopeMode(args.tenant) !== 'off') {
    const authError = await requireAuth(request, args.tenantId)
    if (authError) return authError
    const user = await getSessionUser(request)
    return enforcePermission({ user, ...args, route: request.nextUrl.pathname })
  }
  return requireAdminRole(request, args.tenantId)
}
