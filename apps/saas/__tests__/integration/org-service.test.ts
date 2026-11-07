import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/email', () => ({ sendOrgInvitationEmail: vi.fn().mockResolvedValue(undefined) }))

import { auth } from '@/lib/auth'
import { sendOrgInvitationEmail } from '@/lib/email'
import {
  createOrganization, linkTenants, unlinkTenant, previewUnlink, addMember, updateMember, revokeMember,
  createInvitation, acceptInvitation, registerFromInvitation, previewInvitation, cancelInvitation, updateOrganization,
  OrgError, type AuditActor,
} from '@/lib/organizations/service'
import { clearProjectionCaches } from '@/lib/organizations/projection'
import { clearOrgAccessModeCache } from '@/lib/org-access'
import { clearFreshUserCache, requireAuth } from '@/lib/apiAuth'
import Organization from '@/models/Organization'
import OrgMembership from '@/models/OrgMembership'
import OrgInvitation from '@/models/OrgInvitation'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import User from '@/models/User'
import AuditLog from '@/models/AuditLog'
import { POST as orgsPOST, GET as orgsGET } from '@/app/api/superadmin/organizations/route'
import { POST as invitePOST } from '@/app/api/superadmin/organizations/[orgId]/invitations/route'
import { POST as groupInvPOST, GET as groupInvGET } from '@/app/api/grupo/invitations/route'

/**
 * Multi-marca PR 9a: servicio de organizaciones (superadmin) e invitaciones.
 * Incluye concurrencia (doble vinculación, doble aceptación) y el recorrido
 * completo con la proyección prendida.
 */

const authMock = vi.mocked(auth)
const SA: AuditActor = { userId: String(new mongoose.Types.ObjectId()), name: 'Super', role: 'superadmin' }
const BASE = { baseUrl: 'https://app.test' }

let tA: string, tB: string, tIndep: string, lA: string

async function expectOrgError(p: Promise<unknown>, status: number, code?: string) {
  const err = await p.then(() => null, e => e)
  expect(err).toBeInstanceOf(OrgError)
  expect((err as OrgError).status).toBe(status)
  if (code) expect((err as OrgError).code).toBe(code)
}

/** Invita capturando el token del email (el servicio no lo devuelve). */
async function inviteAndGetToken(orgId: string, body: Record<string, unknown>) {
  let url = ''
  await createInvitation(orgId, body, SA, { ...BASE, send: async (_to, _org, acceptUrl) => { url = acceptUrl } })
  return new URL(url).searchParams.get('token')!
}

function loginAs(u: { _id: unknown; role: string; email: string; tenantId?: unknown }) {
  authMock.mockResolvedValue({
    user: { id: String(u._id), role: u.role, email: u.email, name: 'X', tenantId: u.tenantId ? String(u.tenantId) : null, tenantSlug: null, assignedLocations: [], assignedTenants: [], issuedAt: Math.floor(Date.now() / 1000) },
  } as never)
}

beforeEach(async () => {
  await mongoose.connection.dropDatabase()
  await Promise.all([Organization.syncIndexes(), OrgMembership.syncIndexes(), OrgInvitation.syncIndexes()])
  clearProjectionCaches()
  clearFreshUserCache()
  tA = String((await Tenant.create({ name: 'A', slug: 'marca-a', plan: 'full' }))._id)
  tB = String((await Tenant.create({ name: 'B', slug: 'marca-b', plan: 'full' }))._id)
  tIndep = String((await Tenant.create({ name: 'I', slug: 'indep', plan: 'full' }))._id)
  lA = String((await Location.collection.insertOne({ tenantId: new mongoose.Types.ObjectId(tA), name: 'S', slug: 's' })).insertedId)
})

afterEach(() => {
  delete process.env.ORG_ACCESS_MODE
  clearOrgAccessModeCache()
  authMock.mockResolvedValue({ user: { id: 'admin-id', role: 'superadmin', tenantSlug: 'test-tenant' } } as never)
})

describe('organizaciones', () => {
  it('alta: valida nombre y slug (formato, reservado, único) y audita', async () => {
    const org = await createOrganization({ name: 'Grupo Uno', slug: 'grupo-uno' }, SA)
    expect(org.ownerUserId).toBeNull()
    await expectOrgError(createOrganization({ name: 'X', slug: 'otro' }, SA), 400, 'invalid_name')
    await expectOrgError(createOrganization({ name: 'Otro', slug: 'grupo' }, SA), 400, 'invalid_slug')
    await expectOrgError(createOrganization({ name: 'Otro', slug: 'grupo-uno' }, SA), 409, 'slug_taken')
    const log = await AuditLog.findOne({ action: 'org.created' }).lean()
    expect(log).toMatchObject({ tenantId: null, organizationId: org._id })
  })

  it('suspender sube la versión (corta membresías)', async () => {
    const org = await createOrganization({ name: 'Grupo', slug: 'grupo-s' }, SA)
    await updateOrganization(String(org._id), { status: 'suspended' }, SA)
    expect((await Organization.findById(org._id).lean())?.membershipsVersion).toBe(1)
    await expectOrgError(updateOrganization(String(org._id), { status: 'deleted' }, SA), 400, 'invalid_status')
  })
})

describe('vincular y desvincular marcas', () => {
  it('vincula independientes; una marca de otra organización queda en conflicto y no se pisa', async () => {
    const o1 = await createOrganization({ name: 'Uno', slug: 'org-uno' }, SA)
    const o2 = await createOrganization({ name: 'Dos', slug: 'org-dos' }, SA)
    expect((await linkTenants(String(o1._id), [tA], SA)).linked).toEqual([tA])
    const r = await linkTenants(String(o2._id), [tA, tB], SA)
    expect(r.linked).toEqual([tB])
    expect(r.conflicts).toMatchObject([{ tenantId: tA, status: 'other_org' }])
    expect(String((await Tenant.findById(tA).lean())?.organizationId)).toBe(String(o1._id))
    // Idempotente: volver a vincular la misma marca no cambia nada.
    expect((await linkTenants(String(o1._id), [tA], SA)).linked).toEqual([tA])
  })

  it('doble vinculación en paralelo a dos organizaciones: gana una sola', async () => {
    const o1 = await createOrganization({ name: 'Uno', slug: 'org-p1' }, SA)
    const o2 = await createOrganization({ name: 'Dos', slug: 'org-p2' }, SA)
    const [r1, r2] = await Promise.all([linkTenants(String(o1._id), [tIndep], SA), linkTenants(String(o2._id), [tIndep], SA)])
    expect(r1.linked.length + r2.linked.length).toBe(1)
    expect(r1.conflicts.length + r2.conflicts.length).toBe(1)
  })

  it('desvincular limpia el alcance de las membresías y avisa cuántas pierden alcance', async () => {
    const org = await createOrganization({ name: 'Uno', slug: 'org-u' }, SA)
    const id = String(org._id)
    await linkTenants(id, [tA, tB], SA)
    const u = await User.create({ name: 'BM', email: 'bm@t.test', password: 'Pass-123456!', role: 'member' })
    await addMember(id, { email: 'bm@t.test', orgRole: 'brand_manager', scope: { tenantIds: [tA, tB] } }, SA)
    expect((await previewUnlink(id, tA)).affectedMemberships).toBe(1)
    await unlinkTenant(id, tA, SA)
    const m = await OrgMembership.findOne({ userId: u._id }).lean()
    expect(m?.scope.tenantIds.map(String)).toEqual([tB])
    expect((await Tenant.findById(tA).lean())?.organizationId).toBeUndefined()
    await expectOrgError(unlinkTenant(id, tA, SA), 404, 'not_linked')
  })

  it('volver a vincular no reabre un alcance viejo que quedó en una membresía', async () => {
    const org = await createOrganization({ name: 'Uno', slug: 'org-v' }, SA)
    const id = String(org._id)
    await linkTenants(id, [tA, tB], SA)
    const u = await User.create({ name: 'BM', email: 'bm2@t.test', password: 'Pass-123456!', role: 'member' })
    await addMember(id, { email: 'bm2@t.test', orgRole: 'brand_manager', scope: { tenantIds: [tA, tB] } }, SA)
    // Simula una desvinculación a medias: la marca salió pero la membresía conservó tA.
    await Tenant.updateOne({ _id: tA }, { $unset: { organizationId: 1 } })
    await linkTenants(id, [tA], SA)
    const m = await OrgMembership.findOne({ userId: u._id }).lean()
    expect(m?.scope.tenantIds.map(String)).toEqual([tB])
  })
})

describe('miembros', () => {
  let orgId: string
  beforeEach(async () => {
    orgId = String((await createOrganization({ name: 'Uno', slug: 'org-m' }, SA))._id)
    await linkTenants(orgId, [tA], SA)
  })

  it('alta directa valida rol↔alcance, alcance dentro de la org y usuario elegible', async () => {
    await User.create({ name: 'U', email: 'u@t.test', password: 'Pass-123456!', role: 'admin', tenantId: tIndep })
    await User.create({ name: 'SA', email: 'sa@t.test', password: 'Pass-123456!', role: 'superadmin' })
    await expectOrgError(addMember(orgId, { email: 'u@t.test', orgRole: 'brand_manager', scope: { tenantIds: [tB] } }, SA), 400, 'tenant_outside_org')
    await expectOrgError(addMember(orgId, { email: 'u@t.test', orgRole: 'owner', scope: { tenantIds: [tA] } }, SA), 400, 'scope_owner_all_tenants')
    await expectOrgError(addMember(orgId, { email: 'sa@t.test', orgRole: 'accountant', scope: { allTenants: true } }, SA), 400, 'user_superadmin')
    await expectOrgError(addMember(orgId, { email: 'nadie@t.test', orgRole: 'accountant', scope: { allTenants: true } }, SA), 404, 'user_not_found')
    await expectOrgError(addMember(orgId, { email: 'u@t.test', orgRole: 'location_manager', scope: { locations: [{ tenantId: tA, locationId: String(new mongoose.Types.ObjectId()) }] } }, SA), 400, 'location_outside_tenant')
    const m = await addMember(orgId, { email: 'u@t.test', orgRole: 'location_manager', scope: { locations: [{ tenantId: tA, locationId: lA }] } }, SA)
    expect(m.orgRole).toBe('location_manager')
    await expectOrgError(addMember(orgId, { email: 'u@t.test', orgRole: 'accountant', scope: { allTenants: true } }, SA), 409, 'already_member')
  })

  it('owner: sincroniza ownerUserId y nunca deja la org sin propietario', async () => {
    const a = await User.create({ name: 'A', email: 'a@t.test', password: 'Pass-123456!', role: 'member' })
    await User.create({ name: 'B', email: 'b@t.test', password: 'Pass-123456!', role: 'member' })
    const ma = await addMember(orgId, { email: 'a@t.test', orgRole: 'owner', scope: { allTenants: true } }, SA)
    expect(String((await Organization.findById(orgId).lean())?.ownerUserId)).toBe(String(a._id))
    await expectOrgError(revokeMember(orgId, String(ma._id), null, SA), 409, 'last_owner')
    await expectOrgError(updateMember(orgId, String(ma._id), { orgRole: 'org_admin' }, SA), 409, 'last_owner')
    await expectOrgError(updateMember(orgId, String(ma._id), { status: 'suspended' }, SA), 409, 'last_owner')
    // Transferir: B owner, después A puede bajar.
    await addMember(orgId, { email: 'b@t.test', orgRole: 'owner', scope: { allTenants: true } }, SA)
    await updateMember(orgId, String(ma._id), { orgRole: 'org_admin' }, SA)
    expect((await OrgMembership.findById(ma._id).lean())?.orgRole).toBe('org_admin')
  })

  it('revocar es idempotente, sube la versión y queda auditado', async () => {
    await User.create({ name: 'C', email: 'c@t.test', password: 'Pass-123456!', role: 'member' })
    const m = await addMember(orgId, { email: 'c@t.test', orgRole: 'accountant', scope: { allTenants: true } }, SA)
    const v0 = (await Organization.findById(orgId).lean())!.membershipsVersion
    await revokeMember(orgId, String(m._id), 'baja', SA)
    await revokeMember(orgId, String(m._id), 'baja', SA)
    expect((await OrgMembership.findById(m._id).lean())?.status).toBe('revoked')
    expect((await Organization.findById(orgId).lean())!.membershipsVersion).toBe(v0 + 1)
    expect(await AuditLog.countDocuments({ action: 'org.membership.revoked' })).toBe(1)
  })
})

describe('invitaciones', () => {
  let orgId: string
  beforeEach(async () => {
    orgId = String((await createOrganization({ name: 'Grupo Inv', slug: 'org-i' }, SA))._id)
    await linkTenants(orgId, [tA], SA)
  })

  it('guarda solo el hash; el email lleva el token; una sola vigente por email', async () => {
    const t1 = await inviteAndGetToken(orgId, { email: 'Ana@T.test', orgRole: 'owner', scope: { allTenants: true } })
    const inv = await OrgInvitation.findOne({ email: 'ana@t.test' }).lean()
    expect(inv?.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(inv?.tokenHash).not.toContain(t1)
    await inviteAndGetToken(orgId, { email: 'ana@t.test', orgRole: 'owner', scope: { allTenants: true } })
    expect(await OrgInvitation.countDocuments({ email: 'ana@t.test', status: 'pending' })).toBe(1)
    await expectOrgError(previewInvitation(t1), 409, 'invitation_used') // la primera quedó cancelada
  })

  it('cuenta existente: acepta con el email correcto; con otra cuenta, 403', async () => {
    const ana = await User.create({ name: 'Ana', email: 'ana@t.test', password: 'Pass-123456!', role: 'admin', tenantId: tIndep })
    const otro = await User.create({ name: 'Otro', email: 'otro@t.test', password: 'Pass-123456!', role: 'admin', tenantId: tIndep })
    const token = await inviteAndGetToken(orgId, { email: 'ana@t.test', orgRole: 'owner', scope: { allTenants: true } })
    expect((await previewInvitation(token))).toMatchObject({ organization: { slug: 'org-i' }, orgRole: 'owner', emailHint: 'an***@t.test', accountExists: true })
    await expectOrgError(acceptInvitation(token, String(otro._id)), 403, 'email_mismatch')
    await expectOrgError(acceptInvitation(token, null), 401, 'no_session')
    const r = await acceptInvitation(token, String(ana._id))
    expect(r.alreadyMember).toBe(false)
    expect((await OrgMembership.findOne({ userId: ana._id }).lean())?.orgRole).toBe('owner')
    expect(String((await Organization.findById(orgId).lean())?.ownerUserId)).toBe(String(ana._id))
    // Su acceso de origen no cambia.
    expect((await User.findById(ana._id).lean())).toMatchObject({ role: 'admin' })
    await expectOrgError(acceptInvitation(token, String(ana._id)), 409, 'invitation_used')
  })

  it('doble aceptación en paralelo: una sola membresía', async () => {
    const ana = await User.create({ name: 'Ana', email: 'ana2@t.test', password: 'Pass-123456!', role: 'member' })
    const token = await inviteAndGetToken(orgId, { email: 'ana2@t.test', orgRole: 'accountant', scope: { allTenants: true } })
    const results = await Promise.allSettled([acceptInvitation(token, String(ana._id)), acceptInvitation(token, String(ana._id))])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(await OrgMembership.countDocuments({ userId: ana._id })).toBe(1)
  })

  it('cuenta nueva: se crea como member, sin comercio, y acepta', async () => {
    const token = await inviteAndGetToken(orgId, { email: 'nueva@t.test', orgRole: 'brand_manager', scope: { tenantIds: [tA] } })
    expect((await previewInvitation(token)).accountExists).toBe(false)
    await expectOrgError(registerFromInvitation(token, { name: 'Nueva', password: 'corta' }), 400, 'weak_password')
    const r = await registerFromInvitation(token, { name: 'Nueva', password: 'Clave-segura-1' })
    const u = await User.findOne({ email: 'nueva@t.test' }).lean()
    expect(u).toMatchObject({ role: 'member', tenantId: null })
    expect(u?.password).not.toBe('Clave-segura-1') // se guarda hasheada
    expect(r.membershipId).toBeTruthy()
  })

  it('cuenta nueva con email ya registrado: 409 (tiene que iniciar sesión)', async () => {
    await User.create({ name: 'Ya', email: 'ya@t.test', password: 'Pass-123456!', role: 'consumer' })
    const token = await inviteAndGetToken(orgId, { email: 'ya@t.test', orgRole: 'accountant', scope: { allTenants: true } })
    await expectOrgError(registerFromInvitation(token, { name: 'Ya', password: 'Clave-segura-1' }), 409, 'account_exists')
  })

  it('vencida: 410; cancelada: no sirve; token inventado: 404', async () => {
    const token = await inviteAndGetToken(orgId, { email: 'v@t.test', orgRole: 'accountant', scope: { allTenants: true } })
    await OrgInvitation.updateOne({ email: 'v@t.test' }, { expiresAt: new Date(Date.now() - 1000) })
    await expectOrgError(previewInvitation(token), 410, 'invitation_expired')
    const t2 = await inviteAndGetToken(orgId, { email: 'c@t.test', orgRole: 'accountant', scope: { allTenants: true } })
    const inv = await OrgInvitation.findOne({ email: 'c@t.test' }).lean()
    await cancelInvitation(orgId, String(inv!._id), SA)
    await expectOrgError(previewInvitation(t2), 409, 'invitation_used')
    await expectOrgError(previewInvitation('x'.repeat(43)), 404, 'invitation_not_found')
  })

  it('si la marca se desvinculó después de invitar, la aceptación se rechaza', async () => {
    const u = await User.create({ name: 'BM', email: 'bm@t.test', password: 'Pass-123456!', role: 'member' })
    const token = await inviteAndGetToken(orgId, { email: 'bm@t.test', orgRole: 'brand_manager', scope: { tenantIds: [tA] } })
    await unlinkTenant(orgId, tA, SA)
    await expectOrgError(acceptInvitation(token, String(u._id)), 400, 'tenant_outside_org')
    expect((await OrgInvitation.findOne({ email: 'bm@t.test' }).lean())?.status).toBe('pending')
  })
})

describe('rutas HTTP', () => {
  const json = (url: string, method: string, body?: unknown) =>
    new NextRequest(`http://localhost${url}`, { method, body: body ? JSON.stringify(body) : undefined, headers: { 'content-type': 'application/json' } })

  it('el panel de organizaciones exige superadmin', async () => {
    const admin = await User.create({ name: 'Ad', email: 'ad@t.test', password: 'Pass-123456!', role: 'admin', tenantId: tA })
    loginAs({ _id: admin._id, role: 'admin', email: 'ad@t.test', tenantId: tA })
    expect((await orgsGET(json('/api/superadmin/organizations', 'GET'))).status).toBe(403)
    expect((await orgsPOST(json('/api/superadmin/organizations', 'POST', { name: 'X', slug: 'xx' }))).status).toBe(403)
  })

  it('invitar por HTTP no devuelve el token ni su hash', async () => {
    const sa = await User.create({ name: 'S', email: 's@t.test', password: 'Pass-123456!', role: 'superadmin' })
    loginAs({ _id: sa._id, role: 'superadmin', email: 's@t.test' })
    const org = await createOrganization({ name: 'Http', slug: 'org-h' }, SA)
    const res = await invitePOST(json(`/api/superadmin/organizations/${org._id}/invitations`, 'POST', { email: 'x@t.test', orgRole: 'accountant', scope: { allTenants: true } }), { params: Promise.resolve({ orgId: String(org._id) }) })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.emailSent).toBe(true)
    expect(JSON.stringify(body)).not.toMatch(/token/i)
    expect(vi.mocked(sendOrgInvitationEmail)).toHaveBeenCalled()
  })

  it('recorrido completo: invitación → aceptación por HTTP → opera la marca con org.access en enforce', async () => {
    process.env.ORG_ACCESS_MODE = 'enforce'
    clearOrgAccessModeCache()
    const orgId = String((await createOrganization({ name: 'Full', slug: 'org-f' }, SA))._id)
    await linkTenants(orgId, [tA], SA)
    const user = await User.create({ name: 'Ow', email: 'ow@t.test', password: 'Pass-123456!', role: 'member' })
    const token = await inviteAndGetToken(orgId, { email: 'ow@t.test', orgRole: 'owner', scope: { allTenants: true } })
    loginAs({ _id: user._id, role: 'member', email: 'ow@t.test' })

    expect((await requireAuth(json('/api/marca-a/orders', 'GET'), tA))?.status).toBe(403) // antes de aceptar
    const view = await groupInvGET(new NextRequest(`http://localhost/api/grupo/invitations?token=${token}`))
    expect(view.status).toBe(200)
    const res = await groupInvPOST(json('/api/grupo/invitations', 'POST', { token, action: 'accept' }))
    expect(res.status).toBe(200)
    expect(await requireAuth(json('/api/marca-a/orders', 'GET'), tA)).toBeNull()
    expect((await requireAuth(json('/api/marca-b/orders', 'GET'), tB))?.status).toBe(403) // marca fuera de la org
  })
})
