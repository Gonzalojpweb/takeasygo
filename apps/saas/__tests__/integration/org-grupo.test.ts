import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import { isSignInAllowed } from '@/lib/signin-guard'
import { getMyOrganizations, hasUsableMembership } from '@/lib/organizations/me'
import Organization from '@/models/Organization'
import OrgMembership from '@/models/OrgMembership'
import Tenant from '@/models/Tenant'

/** Multi-marca PR 9b: login de `member` y «mis organizaciones». */

const oid = () => new mongoose.Types.ObjectId()
let orgA: mongoose.Types.ObjectId, tA1: string, tA2: string, lA1: string

beforeEach(async () => {
  await mongoose.connection.dropDatabase()
  orgA = (await Organization.create({ name: 'Grupo A', slug: 'grupo-a' }))._id
  tA1 = String((await Tenant.create({ name: 'Alfa', slug: 'alfa', plan: 'full', organizationId: orgA }))._id)
  tA2 = String((await Tenant.create({ name: 'Beta', slug: 'beta', plan: 'full', organizationId: orgA }))._id)
  lA1 = String(oid())
})

describe('quién puede iniciar sesión', () => {
  it('member: solo con una membresía activa en una organización activa', async () => {
    const userId = oid()
    expect(await isSignInAllowed({ _id: userId, role: 'member' })).toBe(false)
    const m = await OrgMembership.create({ organizationId: orgA, userId, orgRole: 'accountant', scope: { allTenants: true } })
    expect(await isSignInAllowed({ _id: userId, role: 'member' })).toBe(true)
    await Organization.updateOne({ _id: orgA }, { status: 'suspended' })
    expect(await isSignInAllowed({ _id: userId, role: 'member' })).toBe(false)
    await Organization.updateOne({ _id: orgA }, { status: 'active' })
    await OrgMembership.updateOne({ _id: m._id }, { status: 'revoked' })
    expect(await hasUsableMembership(String(userId))).toBe(false)
  })

  it('staff: igual que antes (comercio de origen activo); superadmin siempre', async () => {
    expect(await isSignInAllowed({ role: 'superadmin' })).toBe(true)
    expect(await isSignInAllowed({ role: 'admin', tenantId: tA1 })).toBe(true)
    expect(await isSignInAllowed({ role: 'admin', tenantId: null })).toBe(false)
    expect(await isSignInAllowed({ role: 'admin', tenantId: oid() })).toBe(false)
    await Tenant.updateOne({ _id: tA2 }, { status: 'deleted' })
    expect(await isSignInAllowed({ role: 'admin', tenantId: tA2 })).toBe(false)
  })
})

describe('mis organizaciones', () => {
  it('lista solo las marcas que alcanza su membresía, con el rol efectivo', async () => {
    const userId = oid()
    await OrgMembership.create({ organizationId: orgA, userId, orgRole: 'brand_manager', scope: { tenantIds: [tA1] } })
    const orgs = await getMyOrganizations(String(userId))
    expect(orgs).toHaveLength(1)
    expect(orgs[0]).toMatchObject({ organization: { slug: 'grupo-a' }, orgRole: 'brand_manager' })
    expect(orgs[0].brands).toEqual([{ tenantId: tA1, slug: 'alfa', name: 'Alfa', role: 'manager', locationIds: [] }])
  })

  it('gerente de sede: la marca con sus sedes; organización suspendida: nada', async () => {
    const userId = oid()
    await OrgMembership.create({ organizationId: orgA, userId, orgRole: 'location_manager', scope: { locations: [{ tenantId: tA1, locationId: lA1 }] } })
    expect((await getMyOrganizations(String(userId)))[0].brands).toEqual([{ tenantId: tA1, slug: 'alfa', name: 'Alfa', role: 'manager', locationIds: [lA1] }])
    await Organization.updateOne({ _id: orgA }, { status: 'suspended' })
    expect(await getMyOrganizations(String(userId))).toEqual([])
  })

  it('owner: todas las marcas de la org, sin las dadas de baja ni las de otra org', async () => {
    const userId = oid()
    const other = await Organization.create({ name: 'Otra', slug: 'otra' })
    await Tenant.create({ name: 'Ajena', slug: 'ajena', plan: 'full', organizationId: other._id })
    await Tenant.updateOne({ _id: tA2 }, { status: 'deleted' })
    await OrgMembership.create({ organizationId: orgA, userId, orgRole: 'owner', scope: { allTenants: true } })
    const [org] = await getMyOrganizations(String(userId))
    expect(org.brands.map(b => b.slug)).toEqual(['alfa'])
    expect(org.brands[0].role).toBe('admin')
  })
})
