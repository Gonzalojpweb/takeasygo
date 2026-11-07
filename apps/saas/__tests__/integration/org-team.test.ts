import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/email', () => ({ sendOrgInvitationEmail: vi.fn().mockResolvedValue(undefined) }))

import { auth } from '@/lib/auth'
import { clearFreshUserCache } from '@/lib/apiAuth'
import { clearProjectionCaches } from '@/lib/organizations/projection'
import { getOrganizationDetail } from '@/lib/organizations/service'
import { getMyOrganizations, lastBrandFor, rememberLastBrand, switcherBrands } from '@/lib/organizations/me'
import { GET as teamGET } from '@/app/api/grupo/[slug]/equipo/route'
import { POST as invitePOST } from '@/app/api/grupo/[slug]/equipo/invitaciones/route'
import { DELETE as inviteDELETE } from '@/app/api/grupo/[slug]/equipo/invitaciones/[invitationId]/route'
import { DELETE as memberDELETE } from '@/app/api/grupo/[slug]/equipo/miembros/[membershipId]/route'
import Organization from '@/models/Organization'
import OrgMembership from '@/models/OrgMembership'
import OrgInvitation from '@/models/OrgInvitation'
import Tenant from '@/models/Tenant'
import User from '@/models/User'

/** Equipo del grupo (/grupo/[slug]/equipo), roles por sede, selector y última marca. */

const authMock = vi.mocked(auth)
const oid = () => new mongoose.Types.ObjectId()
let orgA: mongoose.Types.ObjectId, tA1: string, tA2: string, lA1: string, lA2: string

const P = (extra: Record<string, string> = {}) => ({ params: Promise.resolve({ slug: 'grupo-a', ...extra }) })
const req = (method = 'GET', body?: unknown) =>
  new NextRequest('http://localhost/api/grupo/grupo-a/equipo', { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

async function member(email: string, orgRole: string, scope: Record<string, unknown>) {
  const u = await User.create({ name: email, email, password: 'Pass-123456!', role: 'member', tenantId: null, phone: `+54911${Math.floor(Math.random() * 1e8)}` })
  const m = await OrgMembership.create({ organizationId: orgA, userId: u._id, orgRole, scope, grantedBy: oid() })
  return { u, m }
}
function loginAs(u: { _id: unknown; email?: string }) {
  authMock.mockResolvedValue({ user: { id: String(u._id), role: 'member', email: u.email, name: 'X', tenantId: null, tenantSlug: null, assignedLocations: [], issuedAt: Math.floor(Date.now() / 1000) } } as never)
}
async function invite(body: Record<string, unknown>) {
  const res = await invitePOST(req('POST', body), P())
  return { status: res.status, body: await res.json() }
}

beforeEach(async () => {
  await mongoose.connection.dropDatabase()
  clearFreshUserCache()
  clearProjectionCaches()
  orgA = (await Organization.create({ name: 'Grupo A', slug: 'grupo-a' }))._id
  tA1 = String((await Tenant.create({ name: 'Alfa', slug: 'alfa', plan: 'full', organizationId: orgA }))._id)
  tA2 = String((await Tenant.create({ name: 'Beta', slug: 'beta', plan: 'full', organizationId: orgA }))._id)
  lA1 = String((await mongoose.connection.db!.collection('locations').insertOne({ tenantId: new mongoose.Types.ObjectId(tA1), name: 'Centro', slug: 'centro-a1', isActive: true })).insertedId)
  lA2 = String((await mongoose.connection.db!.collection('locations').insertOne({ tenantId: new mongoose.Types.ObjectId(tA2), name: 'Norte', slug: 'norte-a2', isActive: true })).insertedId)
})

describe('quién entra a «Equipo del grupo»', () => {
  it('propietario y administrador general sí; contador 403; quien no es miembro 404; sin sesión 401', async () => {
    const { u: owner } = await member('owner@t.test', 'owner', { allTenants: true })
    loginAs(owner)
    const ok = await teamGET(req(), P())
    expect(ok.status).toBe(200)
    const data = await ok.json()
    expect(data.myRole).toBe('owner')
    expect(data.tenants.find((t: { slug: string }) => t.slug === 'alfa').locations).toEqual([{ _id: lA1, name: 'Centro' }])

    const { u: acc } = await member('acc@t.test', 'accountant', { allTenants: true })
    loginAs(acc)
    expect((await teamGET(req(), P())).status).toBe(403)

    const outsider = await User.create({ name: 'o', email: 'o@t.test', password: 'Pass-123456!', role: 'member', phone: '+5491100000001' })
    loginAs(outsider)
    expect((await teamGET(req(), P())).status).toBe(404)

    authMock.mockResolvedValue(null as never)
    expect((await teamGET(req(), P())).status).toBe(401)
  })
})

describe('permisos al invitar y quitar', () => {
  it('propietario: invita cualquier rol, incluido gerente de sede con sus sedes', async () => {
    const { u: owner } = await member('owner@t.test', 'owner', { allTenants: true })
    loginAs(owner)
    const r = await invite({ email: 'gs@t.test', orgRole: 'location_manager', scope: { locations: [{ tenantId: tA1, locationId: lA1 }] } })
    expect(r.status).toBe(201)
    expect(r.body.invitation).not.toHaveProperty('tokenHash')
    const inv = await OrgInvitation.findOne({ email: 'gs@t.test' }).lean()
    expect(inv?.scope?.locations?.map(l => String(l.locationId))).toEqual([lA1])
    expect((await invite({ email: 'ow2@t.test', orgRole: 'owner', scope: { allTenants: true } })).status).toBe(201)
  })

  it('una sede de otra marca o de afuera se rechaza (alcance dentro de la organización)', async () => {
    const { u: owner } = await member('owner@t.test', 'owner', { allTenants: true })
    loginAs(owner)
    expect((await invite({ email: 'x@t.test', orgRole: 'operations', scope: { locations: [{ tenantId: tA1, locationId: lA2 }] } })).status).toBe(400)
    expect((await invite({ email: 'x@t.test', orgRole: 'operations', scope: { locations: [] } })).status).toBe(400)
  })

  it('administrador general: no invita propietarios ni administradores; solo dentro de su alcance', async () => {
    const { u: admin } = await member('adm@t.test', 'org_admin', { tenantIds: [tA1] })
    loginAs(admin)
    expect((await invite({ email: 'a@t.test', orgRole: 'owner', scope: { allTenants: true } })).status).toBe(403)
    expect((await invite({ email: 'a@t.test', orgRole: 'org_admin', scope: { tenantIds: [tA1] } })).status).toBe(403)
    expect((await invite({ email: 'a@t.test', orgRole: 'brand_manager', scope: { tenantIds: [tA2] } })).status).toBe(403)
    expect((await invite({ email: 'a@t.test', orgRole: 'brand_manager', scope: { tenantIds: [tA1] } })).status).toBe(201)
    expect((await invite({ email: 'b@t.test', orgRole: 'location_manager', scope: { locations: [{ tenantId: tA1, locationId: lA1 }] } })).status).toBe(201)
  })

  it('administrador general no quita al propietario ni cancela su invitación; el propietario sí', async () => {
    const { u: owner, m: ownerM } = await member('owner@t.test', 'owner', { allTenants: true })
    const { u: admin, m: adminM } = await member('adm@t.test', 'org_admin', { allTenants: true })
    loginAs(owner)
    await invite({ email: 'ow2@t.test', orgRole: 'owner', scope: { allTenants: true } })
    const ownerInv = await OrgInvitation.findOne({ email: 'ow2@t.test' }).lean()

    loginAs(admin)
    expect((await memberDELETE(req('DELETE', {}), P({ membershipId: String(ownerM._id) }))).status).toBe(403)
    expect((await inviteDELETE(req('DELETE'), P({ invitationId: String(ownerInv!._id) }))).status).toBe(403)

    loginAs(owner)
    expect((await inviteDELETE(req('DELETE'), P({ invitationId: String(ownerInv!._id) }))).status).toBe(200)
    expect((await memberDELETE(req('DELETE', {}), P({ membershipId: String(adminM._id) }))).status).toBe(200)
    expect((await OrgMembership.findById(adminM._id).lean())?.status).toBe('revoked')
    // Nunca sin propietario: el único propietario no se puede quitar.
    expect((await memberDELETE(req('DELETE', {}), P({ membershipId: String(ownerM._id) }))).status).toBe(409)
  })

  it('el detalle del superadmin trae las sedes de cada marca', async () => {
    const d = await getOrganizationDetail(String(orgA))
    expect(d.tenants.map(t => [t.slug, t.locations.map(l => l.name)])).toEqual(expect.arrayContaining([['alfa', ['Centro']], ['beta', ['Norte']]]))
  })
})

describe('selector de marca y última marca', () => {
  it('lista las marcas de todas sus organizaciones y recuerda la última, solo si sigue siendo suya', async () => {
    const { u, m } = await member('bm@t.test', 'brand_manager', { tenantIds: [tA1, tA2] })
    const orgs = await getMyOrganizations(String(u._id))
    expect(switcherBrands(orgs).map(b => b.slug).sort()).toEqual(['alfa', 'beta'])
    expect(await lastBrandFor(String(u._id), orgs)).toBeNull()
    await rememberLastBrand(String(u._id), 'beta')
    expect(await lastBrandFor(String(u._id), orgs)).toBe('beta')
    // Pierde la marca: deja de ser su última marca.
    await OrgMembership.updateOne({ _id: m._id }, { $set: { scope: { allTenants: false, tenantIds: [new mongoose.Types.ObjectId(tA1)], locations: [] } } })
    expect(await lastBrandFor(String(u._id), await getMyOrganizations(String(u._id)))).toBeNull()
  })
})
