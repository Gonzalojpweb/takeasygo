import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import crypto from 'crypto'
import './setup'

import Organization from '@/models/Organization'
import OrgMembership from '@/models/OrgMembership'
import OrgInvitation from '@/models/OrgInvitation'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import User from '@/models/User'
import AuditLog from '@/models/AuditLog'
import { checkScopeWithinOrg } from '@/lib/organizations/scope-check'
import { orgSlugError } from '@/lib/reserved-slugs'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

/**
 * Multi-marca PR 7: modelos de organización. Sin comportamiento nuevo: se
 * prueban índices, valores por defecto y la verificación de alcance contra
 * la base. Los comercios existentes no cambian (organizationId ausente).
 */

const oid = () => new mongoose.Types.ObjectId()

async function syncIndexes() {
  await Promise.all([Organization.syncIndexes(), OrgMembership.syncIndexes(), OrgInvitation.syncIndexes()])
}

describe('Organization', () => {
  beforeEach(async () => { await mongoose.connection.dropDatabase(); await syncIndexes() })

  it('valores por defecto y slug único', async () => {
    const o = await Organization.create({ name: 'Grupo Uno', slug: 'grupo-uno', ownerUserId: oid(), createdBy: oid() })
    expect(o.status).toBe('active')
    expect(o.billing.mode).toBe('per_tenant')
    expect(o.membershipsVersion).toBe(0)
    await expect(Organization.create({ name: 'Otro', slug: 'grupo-uno', ownerUserId: oid(), createdBy: oid() }))
      .rejects.toThrow(/duplicate key/)
  })

  it('rechaza slug con formato inválido', async () => {
    await expect(Organization.create({ name: 'X', slug: 'Con Espacio', ownerUserId: oid(), createdBy: oid() }))
      .rejects.toThrow(/Slug inválido/)
  })

  it('orgSlugError: reservado y formato', () => {
    expect(orgSlugError('grupo')).toMatch(/reservado/)
    expect(orgSlugError('X')).toMatch(/inválido/)
    expect(orgSlugError('barrio-chino')).toBeNull()
  })
})

describe('OrgMembership', () => {
  beforeEach(async () => { await mongoose.connection.dropDatabase(); await syncIndexes() })

  it('una membresía por persona y organización', async () => {
    const organizationId = oid(), userId = oid()
    await OrgMembership.create({ organizationId, userId, orgRole: 'owner', scope: { allTenants: true }, grantedBy: oid() })
    await expect(OrgMembership.create({ organizationId, userId, orgRole: 'accountant', scope: { allTenants: true }, grantedBy: oid() }))
      .rejects.toThrow(/duplicate key/)
    // La misma persona en otra organización sí.
    await OrgMembership.create({ organizationId: oid(), userId, orgRole: 'accountant', scope: { allTenants: true }, grantedBy: oid() })
  })

  it('valores por defecto', async () => {
    const m = await OrgMembership.create({ organizationId: oid(), userId: oid(), orgRole: 'brand_manager', scope: { tenantIds: [oid()] }, grantedBy: oid() })
    expect(m.status).toBe('active')
    expect(m.scope.allTenants).toBe(false)
    expect(m.scope.locations).toEqual([])
    expect(m.tenantRole).toBeNull()
    expect(m.revokedAt).toBeNull()
  })

  it('rechaza un rol que no existe', async () => {
    await expect(OrgMembership.create({ organizationId: oid(), userId: oid(), orgRole: 'cashier', grantedBy: oid() }))
      .rejects.toThrow(/orgRole/)
  })
})

describe('OrgInvitation', () => {
  beforeEach(async () => { await mongoose.connection.dropDatabase(); await syncIndexes() })

  it('guarda solo el hash del token, email en minúsculas y vence a 7 días', async () => {
    const tokenHash = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex')
    const inv = await OrgInvitation.create({ organizationId: oid(), email: 'Ana@Mail.COM', orgRole: 'accountant', scope: { allTenants: true }, tokenHash, invitedBy: oid() })
    expect(inv.email).toBe('ana@mail.com')
    expect(inv.status).toBe('pending')
    const days = (inv.expiresAt.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThanOrEqual(7)
    await expect(OrgInvitation.create({ organizationId: oid(), email: 'b@m.com', orgRole: 'accountant', tokenHash, invitedBy: oid() }))
      .rejects.toThrow(/duplicate key/)
  })

  it('rechaza un token en claro (no hash)', async () => {
    await expect(OrgInvitation.create({ organizationId: oid(), email: 'a@m.com', orgRole: 'accountant', tokenHash: 'token-en-claro', invitedBy: oid() }))
      .rejects.toThrow(/tokenHash/)
  })
})

describe('campos aditivos en modelos existentes', () => {
  beforeEach(async () => { await mongoose.connection.dropDatabase() })

  it('Tenant nuevo sigue independiente: organizationId no se escribe', async () => {
    const t = await Tenant.create({ name: 'Solo', slug: 'solo', plan: 'full' })
    const raw = await mongoose.connection.collection('tenants').findOne({ _id: t._id })
    expect(raw).not.toHaveProperty('organizationId')
  })

  it('User acepta el rol member y sessionsValidAfter arranca en null', async () => {
    const u = await User.create({ name: 'Miembro', email: 'miembro@org.test', password: 'Pass-123456!', role: 'member' })
    expect(u.role).toBe('member')
    expect(u.tenantId).toBeNull()
    expect(u.sessionsValidAfter).toBeNull()
  })

  it('AuditLog: organizationId opcional (null por defecto)', async () => {
    const a = await AuditLog.create({ tenantId: oid(), action: 'x', entity: 'y' })
    expect(a.organizationId).toBeNull()
  })
})

describe('checkScopeWithinOrg (contra la base)', () => {
  let orgA: string, tA1: string, tA2: string, tB: string, lA1: string, lB: string

  beforeEach(async () => {
    await mongoose.connection.dropDatabase()
    const a = await Organization.create({ name: 'Org A', slug: 'org-a', ownerUserId: oid(), createdBy: oid() })
    const b = await Organization.create({ name: 'Org B', slug: 'org-b', ownerUserId: oid(), createdBy: oid() })
    orgA = String(a._id)
    tA1 = String((await Tenant.create({ name: 'A1', slug: 'a-uno', plan: 'full', organizationId: a._id }))._id)
    tA2 = String((await Tenant.create({ name: 'A2', slug: 'a-dos', plan: 'full', organizationId: a._id }))._id)
    tB = String((await Tenant.create({ name: 'B', slug: 'b-uno', plan: 'full', organizationId: b._id }))._id)
    await Tenant.create({ name: 'Indep', slug: 'indep', plan: 'full' })
    lA1 = String((await Location.collection.insertOne({ tenantId: new mongoose.Types.ObjectId(tA1), name: 'Sede A1', slug: 'sede-a1' })).insertedId)
    lB = String((await Location.collection.insertOne({ tenantId: new mongoose.Types.ObjectId(tB), name: 'Sede B', slug: 'sede-b' })).insertedId)
  })

  it('marcas y sedes propias: ok', async () => {
    expect(await checkScopeWithinOrg(orgA, { allTenants: false, tenantIds: [tA1, tA2], locations: [] })).toBeNull()
    expect(await checkScopeWithinOrg(orgA, { allTenants: false, tenantIds: [], locations: [{ tenantId: tA1, locationId: lA1 }] })).toBeNull()
  })

  it('una marca de OTRA organización: rechazada', async () => {
    const r = await checkScopeWithinOrg(orgA, { allTenants: false, tenantIds: [tA1, tB], locations: [] })
    expect(r?.code).toBe('tenant_outside_org')
    expect(r && 'tenantIds' in r ? r.tenantIds : []).toEqual([tB])
  })

  it('un comercio independiente: rechazado', async () => {
    const indep = String((await Tenant.findOne({ slug: 'indep' }).lean())?._id)
    expect((await checkScopeWithinOrg(orgA, { allTenants: false, tenantIds: [indep], locations: [] }))?.code).toBe('tenant_outside_org')
  })

  it('sede de otra marca declarada como propia: rechazada', async () => {
    // lB es de tB (org B); se declara bajo tA1 (org A) para colarla.
    const r = await checkScopeWithinOrg(orgA, { allTenants: false, tenantIds: [], locations: [{ tenantId: tA1, locationId: lB }] })
    expect(r?.code).toBe('location_outside_tenant')
  })

  it('sede de una marca de la org pero declarada bajo otra marca de la misma org: rechazada', async () => {
    const r = await checkScopeWithinOrg(orgA, { allTenants: false, tenantIds: [], locations: [{ tenantId: tA2, locationId: lA1 }] })
    expect(r?.code).toBe('location_outside_tenant')
  })

  it('ids inválidos: rechazados sin consultar', async () => {
    expect((await checkScopeWithinOrg(orgA, { allTenants: false, tenantIds: ['nope'], locations: [] }))?.code).toBe('invalid_id')
  })
})
