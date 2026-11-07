/**
 * lib/organizations/membership-rules.ts — reglas de dominio de las membresías
 * de organización (multi-marca PR 7, diseño §3.4 y §4).
 *
 * Funciones PURAS (sin base de datos): las usan la API del superadmin y la
 * aceptación de invitaciones (PR 9) antes de escribir. Lo que exige leer la
 * base (que las marcas y sedes sean de la organización) está en scope-check.ts.
 *
 * Cada regla devuelve `null` si pasa o un `RuleError` con código estable y
 * mensaje en español para mostrar.
 */
import type { LocationRole } from '@/models/UserLocationRole'
import type { OrgRole } from '@/models/OrgMembership'

export interface RuleError {
  code:
    | 'scope_owner_all_tenants'
    | 'scope_needs_tenants'
    | 'scope_no_locations'
    | 'scope_needs_locations'
    | 'scope_locations_only'
    | 'scope_duplicate'
    | 'tenant_role_only_brand_manager'
    | 'last_owner'
    | 'forbidden_privilege'
    | 'forbidden_out_of_scope'
    | 'self_escalation'
    | 'user_inactive'
    | 'user_superadmin'
  message: string
}

/** Alcance en forma de strings (ids ya normalizados). */
export interface ScopeInput {
  allTenants: boolean
  tenantIds: string[]
  locations: { tenantId: string; locationId: string }[]
}

// ── §4: rol de organización → rol efectivo existente (LocationRole) ────────────

/**
 * La organización no crea una segunda matriz de permisos: cada membresía se
 * traduce, por marca, a un LocationRole existente. `brand_manager` usa
 * `tenantRole` (D2: 'manager' por defecto).
 */
export function effectiveLocationRole(orgRole: OrgRole, tenantRole?: 'admin' | 'manager' | null): LocationRole {
  switch (orgRole) {
    case 'owner':
    case 'org_admin':
      return 'admin'
    case 'brand_manager':
      return tenantRole === 'admin' ? 'admin' : 'manager'
    case 'location_manager':
      return 'manager'
    case 'operations':
      return 'operations_manager'
    case 'accountant':
      return 'auditor'
  }
}

/** Rango para la regla de privilegios: más alto = más poder. */
const RANK: Record<OrgRole, number> = {
  owner: 100,
  org_admin: 80,
  brand_manager: 60,
  location_manager: 40,
  operations: 30,
  accountant: 20,
}

// ── Rol ↔ alcance ──────────────────────────────────────────────────────────────

export function validateRoleScope(orgRole: OrgRole, scope: ScopeInput, tenantRole?: 'admin' | 'manager' | null): RuleError | null {
  if (tenantRole && orgRole !== 'brand_manager') {
    return { code: 'tenant_role_only_brand_manager', message: 'El rol en la marca solo se define para el gerente de marca.' }
  }
  const tenantSet = new Set(scope.tenantIds)
  if (tenantSet.size !== scope.tenantIds.length) {
    return { code: 'scope_duplicate', message: 'Hay marcas repetidas en el alcance.' }
  }
  const locKeys = scope.locations.map(l => `${l.tenantId}:${l.locationId}`)
  if (new Set(locKeys).size !== locKeys.length) {
    return { code: 'scope_duplicate', message: 'Hay sedes repetidas en el alcance.' }
  }

  switch (orgRole) {
    case 'owner':
      if (!scope.allTenants || scope.tenantIds.length || scope.locations.length) {
        return { code: 'scope_owner_all_tenants', message: 'El propietario alcanza todas las marcas de la organización.' }
      }
      return null
    case 'org_admin':
    case 'accountant':
      if (scope.locations.length) return { code: 'scope_no_locations', message: 'Este rol se asigna por marca, no por sede.' }
      if (!scope.allTenants && scope.tenantIds.length === 0) {
        return { code: 'scope_needs_tenants', message: 'Elegí todas las marcas o al menos una.' }
      }
      if (scope.allTenants && scope.tenantIds.length) {
        return { code: 'scope_needs_tenants', message: 'Con «todas las marcas» no se eligen marcas sueltas.' }
      }
      return null
    case 'brand_manager':
      if (scope.locations.length) return { code: 'scope_no_locations', message: 'El gerente de marca se asigna por marca, no por sede.' }
      if (scope.allTenants || scope.tenantIds.length === 0) {
        return { code: 'scope_needs_tenants', message: 'El gerente de marca necesita al menos una marca concreta.' }
      }
      return null
    case 'location_manager':
    case 'operations':
      if (scope.allTenants || scope.tenantIds.length) {
        return { code: 'scope_locations_only', message: 'Este rol se asigna por sede, no por marca.' }
      }
      if (scope.locations.length === 0) {
        return { code: 'scope_needs_locations', message: 'Elegí al menos una sede.' }
      }
      return null
  }
}

// ── Al menos un owner ──────────────────────────────────────────────────────────

/**
 * No se puede revocar, suspender ni degradar al último owner activo.
 * `activeOwners` = owners activos HOY en la organización (incluido el target).
 */
export function checkLastOwner(
  current: { orgRole: OrgRole; status: string },
  next: { orgRole: OrgRole; status: string },
  activeOwners: number,
): RuleError | null {
  const wasActiveOwner = current.orgRole === 'owner' && current.status === 'active'
  const staysActiveOwner = next.orgRole === 'owner' && next.status === 'active'
  if (wasActiveOwner && !staysActiveOwner && activeOwners <= 1) {
    return { code: 'last_owner', message: 'La organización necesita al menos un propietario activo.' }
  }
  return null
}

// ── Privilegios ───────────────────────────────────────────────────────────────

/** Quién actúa: el superadmin de la plataforma o un miembro de la organización. */
export type Actor =
  | { kind: 'superadmin' }
  | { kind: 'member'; userId: string; orgRole: OrgRole; scope: ScopeInput }

/** Alcance A ⊆ alcance B (en marcas y sedes). allTenants cubre todo. */
export function scopeWithin(a: ScopeInput, b: ScopeInput): boolean {
  if (b.allTenants) return true
  if (a.allTenants) return false
  const bTenants = new Set(b.tenantIds)
  if (!a.tenantIds.every(t => bTenants.has(t))) return false
  const bLocs = new Set(b.locations.map(l => `${l.tenantId}:${l.locationId}`))
  // Una sede está cubierta si su marca entera está en B o la sede está en B.
  return a.locations.every(l => bTenants.has(l.tenantId) || bLocs.has(`${l.tenantId}:${l.locationId}`))
}

/**
 * ¿Puede `actor` crear/editar/revocar una membresía con este rol y alcance?
 * - Solo owner gestiona owner y org_admin.
 * - org_admin gestiona roles inferiores dentro de su alcance.
 * - El resto no gestiona membresías.
 * - Nadie se otorga a sí mismo más de lo que tiene.
 * `target.current` es el estado previo al editar (para no permitir que un
 * org_admin «baje» a un owner a un rol que sí podría gestionar).
 */
export function checkPrivilege(
  actor: Actor,
  target: { userId: string; orgRole: OrgRole; scope: ScopeInput; current?: { orgRole: OrgRole; scope: ScopeInput } | null },
): RuleError | null {
  if (actor.kind === 'superadmin') return null

  const roles = [target.orgRole, ...(target.current ? [target.current.orgRole] : [])]
  const scopes = [target.scope, ...(target.current ? [target.current.scope] : [])]

  if (target.userId === actor.userId) {
    const escalates = RANK[target.orgRole] > RANK[actor.orgRole] || !scopeWithin(target.scope, actor.scope)
    if (escalates) return { code: 'self_escalation', message: 'No podés darte más permisos de los que tenés.' }
  }

  if (actor.orgRole === 'owner') return null

  if (actor.orgRole === 'org_admin') {
    if (roles.some(r => r === 'owner' || r === 'org_admin')) {
      return { code: 'forbidden_privilege', message: 'Solo el propietario gestiona propietarios y administradores generales.' }
    }
    if (!scopes.every(s => scopeWithin(s, actor.scope))) {
      return { code: 'forbidden_out_of_scope', message: 'Esa marca o sede está fuera de tu alcance.' }
    }
    return null
  }

  return { code: 'forbidden_privilege', message: 'Tu rol no gestiona el equipo de la organización.' }
}

// ── Usuario elegible ──────────────────────────────────────────────────────────

/**
 * Usuario activo y que no sea superadmin. El cliente de la app (`consumer`)
 * es elegible y su rol NO cambia (D3, opción B aprobada): la membresía le da
 * acceso solo a las marcas de su alcance vía la proyección; en cualquier otro
 * contexto sigue siendo cliente. Los usuarios nuevos creados por una
 * invitación nacen como `member` (PR 9).
 */
export function checkEligibleUser(user: { isActive?: boolean | null; role?: string | null }): RuleError | null {
  if (user.isActive === false) return { code: 'user_inactive', message: 'El usuario está desactivado.' }
  if (user.role === 'superadmin') return { code: 'user_superadmin', message: 'Un superadmin no recibe membresías de organización.' }
  return null
}
