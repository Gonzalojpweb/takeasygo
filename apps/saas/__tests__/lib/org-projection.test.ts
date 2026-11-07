import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

vi.mock('@/lib/auth', () => ({ auth: vi.fn().mockResolvedValue(null) }))

import {
  effectiveGrant, tenantSlugFromApiPath, NON_TENANT_API_SEGMENTS, isWriteRequest, type MembershipLite,
} from '@/lib/organizations/projection'
import { sessionCutOff } from '@/lib/apiAuth'
import { resolvePermission } from '@/lib/rbac'
import { ORG_ROLES, type OrgRole } from '@/models/OrgMembership'
import { NextRequest } from 'next/server'

/** Multi-marca PR 8: parte pura de la proyección (sin base de datos). */

const m = (orgRole: OrgRole, scope: Partial<MembershipLite['scope']> = {}, extra: Partial<MembershipLite> = {}): MembershipLite => ({
  id: 'm1', orgRole, status: 'active', tenantRole: null,
  scope: { allTenants: false, tenantIds: [], locations: [], ...scope }, ...extra,
})

describe('effectiveGrant — tabla §4', () => {
  it('owner: admin en todas las marcas, todas las sedes', () => {
    expect(effectiveGrant(m('owner', { allTenants: true }), 'tA')).toEqual({ role: 'admin', locationIds: [] })
  })

  it('org_admin y accountant: según alcance', () => {
    expect(effectiveGrant(m('org_admin', { allTenants: true }), 'tA')).toEqual({ role: 'admin', locationIds: [] })
    expect(effectiveGrant(m('org_admin', { tenantIds: ['tA'] }), 'tA')).toEqual({ role: 'admin', locationIds: [] })
    expect(effectiveGrant(m('org_admin', { tenantIds: ['tA'] }), 'tB')).toBeNull()
    expect(effectiveGrant(m('accountant', { tenantIds: ['tA'] }), 'tA')).toEqual({ role: 'auditor', locationIds: [] })
    expect(effectiveGrant(m('accountant', { tenantIds: ['tA'] }), 'tB')).toBeNull()
  })

  it('brand_manager: manager por defecto (D2), admin si se pidió, nunca por allTenants', () => {
    expect(effectiveGrant(m('brand_manager', { tenantIds: ['tA'] }), 'tA')).toEqual({ role: 'manager', locationIds: [] })
    expect(effectiveGrant(m('brand_manager', { tenantIds: ['tA'] }, { tenantRole: 'admin' }), 'tA')).toEqual({ role: 'admin', locationIds: [] })
    expect(effectiveGrant(m('brand_manager', { tenantIds: ['tA'] }), 'tB')).toBeNull()
    expect(effectiveGrant(m('brand_manager', { allTenants: true }), 'tA')).toBeNull()
  })

  it('location_manager y operations: solo sus sedes de esa marca', () => {
    const scope = { locations: [{ tenantId: 'tA', locationId: 'l1' }, { tenantId: 'tA', locationId: 'l2' }, { tenantId: 'tB', locationId: 'l9' }] }
    expect(effectiveGrant(m('location_manager', scope), 'tA')).toEqual({ role: 'manager', locationIds: ['l1', 'l2'] })
    expect(effectiveGrant(m('operations', scope), 'tB')).toEqual({ role: 'operations_manager', locationIds: ['l9'] })
    expect(effectiveGrant(m('location_manager', scope), 'tC')).toBeNull()
  })

  it('membresía no activa: nada', () => {
    for (const status of ['suspended', 'revoked']) {
      expect(effectiveGrant(m('owner', { allTenants: true }, { status }), 'tA')).toBeNull()
    }
  })

  it('INVARIANTE: un rol de sede nunca da [] (= todas las sedes)', () => {
    // Barrido de alcances: con o sin sedes en la marca, con allTenants y marcas sueltas mezcladas.
    const tenants = ['tA', 'tB', 'tC']
    const locSets = [[], [{ tenantId: 'tB', locationId: 'x' }], [{ tenantId: 'tA', locationId: 'l1' }]]
    for (const role of ['location_manager', 'operations'] as const) {
      for (const allTenants of [true, false]) {
        for (const tenantIds of [[], ['tA'], tenants]) {
          for (const locations of locSets) {
            for (const t of tenants) {
              const g = effectiveGrant(m(role, { allTenants, tenantIds, locations }), t)
              if (g) expect(g.locationIds.length).toBeGreaterThan(0)
            }
          }
        }
      }
    }
  })

  it('todo rol de organización da un rol que reconoce la matriz', () => {
    for (const r of ORG_ROLES) {
      const g = effectiveGrant(m(r, { allTenants: true, tenantIds: ['tA'], locations: [{ tenantId: 'tA', locationId: 'l1' }] }), 'tA')
      expect(g).not.toBeNull()
      expect(['admin', 'manager', 'operations_manager', 'auditor']).toContain(g!.role)
    }
  })
})

describe('comercio de contexto desde el path', () => {
  it('API de comercio', () => {
    expect(tenantSlugFromApiPath('/api/mi-local/orders')).toBe('mi-local')
    expect(tenantSlugFromApiPath('/api/mi-local')).toBe('mi-local')
  })

  it('APIs que no son de comercio: sin contexto', () => {
    for (const p of ['/api/superadmin/tenants', '/api/auth/session', '/api/grupo/x', '/api/explore/nearby', '/api/mp-oauth/callback', '/api/cron/x']) {
      expect(tenantSlugFromApiPath(p)).toBeNull()
    }
    expect(tenantSlugFromApiPath('/mi-local/admin')).toBeNull()
    expect(tenantSlugFromApiPath('/api/Mayus/x')).toBeNull()
  })

  it('la lista de segmentos coincide con las carpetas fijas de app/api', () => {
    const apiDir = path.join(__dirname, '..', '..', 'app', 'api')
    const dirs = fs.readdirSync(apiDir, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('[')).map(d => d.name)
    expect(dirs.filter(d => !NON_TENANT_API_SEGMENTS.has(d))).toEqual([])
  })

  it('escrituras: todo método distinto de GET/HEAD', () => {
    const r = (method: string) => new NextRequest('http://x/api/a/b', { method })
    expect(isWriteRequest(r('GET'))).toBe(false)
    expect(isWriteRequest(r('HEAD'))).toBe(false)
    for (const mth of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(isWriteRequest(r(mth))).toBe(true)
    expect(isWriteRequest(undefined)).toBe(false)
  })
})

describe('corte de sesiones (sessionsValidAfter)', () => {
  const cut = Date.UTC(2026, 10, 7, 12, 0, 0)
  it('sin corte: nunca corta', () => {
    expect(sessionCutOff(1, null)).toBe(false)
    expect(sessionCutOff(null, null)).toBe(false)
  })
  it('emitida antes del corte: corta; después: no', () => {
    expect(sessionCutOff(cut / 1000 - 60, cut)).toBe(true)
    expect(sessionCutOff(cut / 1000 + 60, cut)).toBe(false)
  })
  it('sin iat y con corte: corta (falla cerrado)', () => {
    expect(sessionCutOff(null, cut)).toBe(true)
    expect(sessionCutOff(undefined, cut)).toBe(true)
  })
})

describe('rbac con miembros proyectados (filas virtuales)', () => {
  const flagOn = { flags: { 'rbac.sedeScope': 'enforce' } }
  const flagOff = { flags: {} }
  const base = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', via: 'membership' }

  it('consolidado: solo tenant-wide', async () => {
    const wide = await resolvePermission({ user: { ...base, role: 'admin', assignedLocations: [] }, tenant: flagOn, tenantId: 't', permission: 'reports.view_consolidated' })
    expect(wide).toMatchObject({ allowed: true, via: 'membership' })
    const sede = await resolvePermission({ user: { ...base, role: 'manager', assignedLocations: ['l1'] }, tenant: flagOn, tenantId: 't', permission: 'reports.view_consolidated' })
    expect(sede.allowed).toBe(false)
  })

  it('sede: su sede sí, otra no', async () => {
    const u = { ...base, role: 'manager', assignedLocations: ['l1'] }
    expect((await resolvePermission({ user: u, tenant: flagOn, tenantId: 't', locationId: 'l1', permission: 'menu.write' })).allowed).toBe(true)
    expect((await resolvePermission({ user: u, tenant: flagOn, tenantId: 't', locationId: 'l2', permission: 'menu.write' })).allowed).toBe(false)
  })

  it('el contador no entra a las salas en vivo, con el flag prendido o apagado', async () => {
    const u = { ...base, role: 'auditor', membershipRole: 'accountant', assignedLocations: [] }
    for (const tenant of [flagOn, flagOff]) {
      expect((await resolvePermission({ user: u, tenant, tenantId: 't', permission: 'rooms.access' })).allowed).toBe(false)
    }
    // Un auditor de origen (sin membresía) conserva lo de hoy.
    const home = { id: base.id, role: 'auditor', assignedLocations: [] }
    expect((await resolvePermission({ user: home, tenant: flagOff, tenantId: 't', permission: 'rooms.access' })).allowed).toBe(true)
  })
})
