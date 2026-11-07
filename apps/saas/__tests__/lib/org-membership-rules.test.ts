import { describe, it, expect } from 'vitest'
import {
  effectiveLocationRole, validateRoleScope, checkLastOwner, checkPrivilege, scopeWithin, checkEligibleUser,
  type ScopeInput, type Actor,
} from '@/lib/organizations/membership-rules'
import { ORG_ROLES } from '@/models/OrgMembership'
import { LOCATION_ROLES } from '@/models/UserLocationRole'

const ALL: ScopeInput = { allTenants: true, tenantIds: [], locations: [] }
const T = (...ids: string[]): ScopeInput => ({ allTenants: false, tenantIds: ids, locations: [] })
const L = (...pairs: [string, string][]): ScopeInput => ({
  allTenants: false, tenantIds: [], locations: pairs.map(([tenantId, locationId]) => ({ tenantId, locationId })),
})

describe('§4 rol de organización → LocationRole existente', () => {
  it('tabla del diseño', () => {
    expect(effectiveLocationRole('owner')).toBe('admin')
    expect(effectiveLocationRole('org_admin')).toBe('admin')
    expect(effectiveLocationRole('brand_manager')).toBe('manager') // D2
    expect(effectiveLocationRole('brand_manager', 'admin')).toBe('admin')
    expect(effectiveLocationRole('location_manager')).toBe('manager')
    expect(effectiveLocationRole('operations')).toBe('operations_manager')
    expect(effectiveLocationRole('accountant')).toBe('auditor')
  })

  it('todo rol de organización cae en un LocationRole que existe', () => {
    for (const r of ORG_ROLES) expect(LOCATION_ROLES).toContain(effectiveLocationRole(r))
  })
})

describe('rol ↔ alcance', () => {
  it('owner: solo todas las marcas', () => {
    expect(validateRoleScope('owner', ALL)).toBeNull()
    expect(validateRoleScope('owner', T('a'))?.code).toBe('scope_owner_all_tenants')
  })

  it('org_admin y accountant: todas o algunas marcas, nunca sedes', () => {
    for (const r of ['org_admin', 'accountant'] as const) {
      expect(validateRoleScope(r, ALL)).toBeNull()
      expect(validateRoleScope(r, T('a', 'b'))).toBeNull()
      expect(validateRoleScope(r, T())?.code).toBe('scope_needs_tenants')
      expect(validateRoleScope(r, L(['a', 'l1']))?.code).toBe('scope_no_locations')
      expect(validateRoleScope(r, { allTenants: true, tenantIds: ['a'], locations: [] })?.code).toBe('scope_needs_tenants')
    }
  })

  it('brand_manager: marcas concretas, sin "todas" ni sedes', () => {
    expect(validateRoleScope('brand_manager', T('a'))).toBeNull()
    expect(validateRoleScope('brand_manager', T('a'), 'admin')).toBeNull()
    expect(validateRoleScope('brand_manager', ALL)?.code).toBe('scope_needs_tenants')
    expect(validateRoleScope('brand_manager', T())?.code).toBe('scope_needs_tenants')
    expect(validateRoleScope('brand_manager', L(['a', 'l1']))?.code).toBe('scope_no_locations')
  })

  it('location_manager y operations: solo sedes', () => {
    for (const r of ['location_manager', 'operations'] as const) {
      expect(validateRoleScope(r, L(['a', 'l1']))).toBeNull()
      expect(validateRoleScope(r, L())?.code).toBe('scope_needs_locations')
      expect(validateRoleScope(r, T('a'))?.code).toBe('scope_locations_only')
      expect(validateRoleScope(r, ALL)?.code).toBe('scope_locations_only')
    }
  })

  it('tenantRole solo para brand_manager', () => {
    expect(validateRoleScope('org_admin', ALL, 'manager')?.code).toBe('tenant_role_only_brand_manager')
  })

  it('rechaza duplicados', () => {
    expect(validateRoleScope('brand_manager', T('a', 'a'))?.code).toBe('scope_duplicate')
    expect(validateRoleScope('operations', L(['a', 'l1'], ['a', 'l1']))?.code).toBe('scope_duplicate')
  })
})

describe('al menos un owner', () => {
  const owner = { orgRole: 'owner' as const, status: 'active' }
  it('no deja revocar, suspender ni degradar al último', () => {
    expect(checkLastOwner(owner, { orgRole: 'owner', status: 'revoked' }, 1)?.code).toBe('last_owner')
    expect(checkLastOwner(owner, { orgRole: 'owner', status: 'suspended' }, 1)?.code).toBe('last_owner')
    expect(checkLastOwner(owner, { orgRole: 'org_admin', status: 'active' }, 1)?.code).toBe('last_owner')
  })
  it('con otro owner activo, sí', () => {
    expect(checkLastOwner(owner, { orgRole: 'org_admin', status: 'active' }, 2)).toBeNull()
  })
  it('no aplica a quien no es owner activo', () => {
    expect(checkLastOwner({ orgRole: 'org_admin', status: 'active' }, { orgRole: 'org_admin', status: 'revoked' }, 1)).toBeNull()
  })
})

describe('alcance contenido', () => {
  it('casos', () => {
    expect(scopeWithin(T('a'), ALL)).toBe(true)
    expect(scopeWithin(ALL, T('a'))).toBe(false)
    expect(scopeWithin(T('a'), T('a', 'b'))).toBe(true)
    expect(scopeWithin(T('c'), T('a', 'b'))).toBe(false)
    expect(scopeWithin(L(['a', 'l1']), T('a'))).toBe(true)
    expect(scopeWithin(L(['c', 'l9']), T('a'))).toBe(false)
    expect(scopeWithin(L(['a', 'l1']), L(['a', 'l1'], ['a', 'l2']))).toBe(true)
    expect(scopeWithin(T('a'), L(['a', 'l1']))).toBe(false)
  })
})

describe('privilegios', () => {
  const sa: Actor = { kind: 'superadmin' }
  const owner: Actor = { kind: 'member', userId: 'u-owner', orgRole: 'owner', scope: ALL }
  const admin: Actor = { kind: 'member', userId: 'u-admin', orgRole: 'org_admin', scope: T('a') }
  const bm: Actor = { kind: 'member', userId: 'u-bm', orgRole: 'brand_manager', scope: T('a') }

  it('superadmin y owner gestionan todo', () => {
    expect(checkPrivilege(sa, { userId: 'x', orgRole: 'owner', scope: ALL })).toBeNull()
    expect(checkPrivilege(owner, { userId: 'x', orgRole: 'org_admin', scope: ALL })).toBeNull()
  })

  it('org_admin no gestiona owner ni org_admin', () => {
    expect(checkPrivilege(admin, { userId: 'x', orgRole: 'org_admin', scope: T('a') })?.code).toBe('forbidden_privilege')
    expect(checkPrivilege(admin, { userId: 'x', orgRole: 'owner', scope: ALL })?.code).toBe('forbidden_privilege')
  })

  it('org_admin no puede degradar a un owner a un rol que sí gestiona', () => {
    expect(checkPrivilege(admin, {
      userId: 'x', orgRole: 'brand_manager', scope: T('a'), current: { orgRole: 'owner', scope: ALL },
    })?.code).toBe('forbidden_privilege')
  })

  it('org_admin gestiona roles inferiores solo dentro de su alcance', () => {
    expect(checkPrivilege(admin, { userId: 'x', orgRole: 'brand_manager', scope: T('a') })).toBeNull()
    expect(checkPrivilege(admin, { userId: 'x', orgRole: 'location_manager', scope: L(['a', 'l1']) })).toBeNull()
    expect(checkPrivilege(admin, { userId: 'x', orgRole: 'brand_manager', scope: T('b') })?.code).toBe('forbidden_out_of_scope')
    expect(checkPrivilege(admin, {
      userId: 'x', orgRole: 'brand_manager', scope: T('a'), current: { orgRole: 'brand_manager', scope: T('b') },
    })?.code).toBe('forbidden_out_of_scope')
  })

  it('los demás roles no gestionan el equipo', () => {
    expect(checkPrivilege(bm, { userId: 'x', orgRole: 'operations', scope: L(['a', 'l1']) })?.code).toBe('forbidden_privilege')
  })

  it('nadie se da más de lo que tiene', () => {
    expect(checkPrivilege(admin, { userId: 'u-admin', orgRole: 'owner', scope: ALL })?.code).toBe('self_escalation')
    expect(checkPrivilege(bm, { userId: 'u-bm', orgRole: 'brand_manager', scope: T('a', 'b') })?.code).toBe('self_escalation')
  })
})

describe('usuario elegible', () => {
  it('casos', () => {
    expect(checkEligibleUser({ isActive: true, role: 'admin' })).toBeNull()
    expect(checkEligibleUser({ isActive: true, role: 'consumer' })).toBeNull() // D3 opción B: elegible y sin cambiar su rol
    expect(checkEligibleUser({ isActive: false, role: 'admin' })?.code).toBe('user_inactive')
    expect(checkEligibleUser({ isActive: true, role: 'superadmin' })?.code).toBe('user_superadmin')
  })
})
