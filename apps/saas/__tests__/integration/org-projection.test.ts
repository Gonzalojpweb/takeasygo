import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import { auth } from '@/lib/auth'
import { getSessionUser, requireAuth, requireTenantRole, clearFreshUserCache, ADMIN_ROLES, MANAGE_ROLES } from '@/lib/apiAuth'
import { clearProjectionCaches } from '@/lib/organizations/projection'
import { clearOrgAccessModeCache } from '@/lib/org-access'
import Organization from '@/models/Organization'
import OrgMembership from '@/models/OrgMembership'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import User from '@/models/User'
import AccessShadowEvent from '@/models/AccessShadowEvent'
import { GET as mpConnect } from '@/app/api/[tenant]/admin/mp-oauth/connect/route'

/**
 * Multi-marca PR 8: proyección de membresías en getSessionUser.
 *
 * Escenario: Org A (marcas a-uno, a-dos), Org B (marca b-uno) y un comercio
 * independiente. Se prueba con el interruptor org.access (env ORG_ACCESS_MODE)
 * en off / log / enforce.
 */

const authMock = vi.mocked(auth)
const oid = () => new mongoose.Types.ObjectId()

let orgA: mongoose.Types.ObjectId, orgB: mongoose.Types.ObjectId
let tA1: string, tA2: string, tB: string, tIndep: string
let lA1: string, lA1b: string

function setMode(mode: 'off' | 'log' | 'enforce') {
  process.env.ORG_ACCESS_MODE = mode
  clearOrgAccessModeCache()
}

function req(path: string, method = 'GET') {
  return new NextRequest(`http://localhost${path}`, { method })
}

/** Simula el JWT de login del usuario (claims de origen). */
function loginAs(u: { _id: unknown; role: string; tenantId?: unknown; email?: string }, issuedAt: number | null = Math.floor(Date.now() / 1000)) {
  authMock.mockResolvedValue({
    user: {
      id: String(u._id), role: u.role, email: u.email ?? 'x@test', name: 'X',
      tenantId: u.tenantId ? String(u.tenantId) : null, tenantSlug: null,
      assignedLocations: [], assignedTenants: [], issuedAt,
    },
  } as never)
}

async function mkUser(email: string, role: string, tenantId: string | null = null) {
  return User.create({ name: email, email, password: 'Pass-123456!', role, tenantId })
}

async function grant(userId: unknown, organizationId: mongoose.Types.ObjectId, orgRole: string, scope: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return OrgMembership.create({ organizationId, userId, orgRole, scope, grantedBy: oid(), ...extra })
}

beforeEach(async () => {
  await mongoose.connection.dropDatabase()
  clearFreshUserCache()
  clearProjectionCaches()
  setMode('enforce')
  const a = await Organization.create({ name: 'Org A', slug: 'org-a', ownerUserId: oid(), createdBy: oid() })
  const b = await Organization.create({ name: 'Org B', slug: 'org-b', ownerUserId: oid(), createdBy: oid() })
  orgA = a._id; orgB = b._id
  tA1 = String((await Tenant.create({ name: 'A1', slug: 'a-uno', plan: 'full', organizationId: orgA }))._id)
  tA2 = String((await Tenant.create({ name: 'A2', slug: 'a-dos', plan: 'full', organizationId: orgA }))._id)
  tB = String((await Tenant.create({ name: 'B', slug: 'b-uno', plan: 'full', organizationId: orgB }))._id)
  tIndep = String((await Tenant.create({ name: 'Indep', slug: 'indep', plan: 'full' }))._id)
  lA1 = String((await Location.collection.insertOne({ tenantId: new mongoose.Types.ObjectId(tA1), name: 'S1', slug: 's1' })).insertedId)
  lA1b = String((await Location.collection.insertOne({ tenantId: new mongoose.Types.ObjectId(tA1), name: 'S2', slug: 's2' })).insertedId)
})

afterEach(() => {
  delete process.env.ORG_ACCESS_MODE
  clearOrgAccessModeCache()
})

describe('org.access = off (estado de hoy)', () => {
  it('una membresía no da nada: el miembro queda afuera', async () => {
    setMode('off')
    const u = await mkUser('m@test', 'member')
    await grant(u._id, orgA, 'owner', { allTenants: true })
    loginAs(u)
    const s = await getSessionUser(req('/api/a-uno/orders'))
    expect(s?.role).toBe('member')
    expect(s?.tenantId).toBeNull()
    expect((await requireAuth(req('/api/a-uno/orders'), tA1))?.status).toBe(403)
  })
})

describe('org.access = enforce', () => {
  it('gerente de marca: manager en su marca; no en la otra marca de la org ni en otra org', async () => {
    const u = await mkUser('bm@test', 'member')
    await grant(u._id, orgA, 'brand_manager', { tenantIds: [tA1] })
    loginAs(u)

    const s = await getSessionUser(req('/api/a-uno/orders')) as Record<string, unknown>
    expect(s).toMatchObject({ role: 'manager', tenantId: tA1, tenantSlug: 'a-uno', assignedLocations: [], via: 'membership', membershipRole: 'brand_manager', organizationId: String(orgA) })
    expect(await requireTenantRole(req('/api/a-uno/orders'), tA1, MANAGE_ROLES)).toBeNull()
    expect((await requireTenantRole(req('/api/a-uno/orders'), tA1, ADMIN_ROLES))?.status).toBe(403) // D2: manager no toca dinero/usuarios

    expect((await requireAuth(req('/api/a-dos/orders'), tA2))?.status).toBe(403)
    expect((await requireAuth(req('/api/b-uno/orders'), tB))?.status).toBe(403)
    expect((await requireAuth(req('/api/indep/orders'), tIndep))?.status).toBe(403)
  })

  it('el comercio de contexto manda: pedir a-uno pidiendo por el path de a-dos falla', async () => {
    const u = await mkUser('bm2@test', 'member')
    await grant(u._id, orgA, 'brand_manager', { tenantIds: [tA1] })
    loginAs(u)
    // Path de a-dos (sin alcance) pero el handler compara con a-uno: el usuario no se proyecta.
    expect((await requireAuth(req('/api/a-dos/orders'), tA1))?.status).toBe(403)
  })

  it('owner de A: admin en todas las marcas de A, nada en B', async () => {
    const u = await mkUser('own@test', 'member')
    await grant(u._id, orgA, 'owner', { allTenants: true })
    loginAs(u)
    expect(await requireTenantRole(req('/api/a-uno/x'), tA1, ADMIN_ROLES)).toBeNull()
    expect(await requireTenantRole(req('/api/a-dos/x'), tA2, ADMIN_ROLES)).toBeNull()
    expect((await requireAuth(req('/api/b-uno/x'), tB))?.status).toBe(403)
  })

  it('gerente de sede: solo sus sedes (nunca [] = todas)', async () => {
    const u = await mkUser('lm@test', 'member')
    await grant(u._id, orgA, 'location_manager', { locations: [{ tenantId: tA1, locationId: lA1 }] })
    loginAs(u)
    const s = await getSessionUser(req('/api/a-uno/x'))
    expect(s).toMatchObject({ role: 'manager', tenantId: tA1, assignedLocations: [lA1], assignedLocation: lA1 })
    expect(s?.assignedLocations).not.toContain(lA1b)
    expect((await requireAuth(req('/api/a-dos/x'), tA2))?.status).toBe(403)
  })

  it('acceso de origen manda en su comercio: un admin de a-uno con membresía de contador sigue admin', async () => {
    const u = await mkUser('home@test', 'admin', tA1)
    await grant(u._id, orgA, 'accountant', { allTenants: true })
    loginAs(u)
    const home = await getSessionUser(req('/api/a-uno/x')) as Record<string, unknown>
    expect(home.role).toBe('admin')
    expect(home.via).toBeUndefined()
    // En la otra marca de la org opera como contador (auditor).
    const other = await getSessionUser(req('/api/a-dos/x')) as Record<string, unknown>
    expect(other).toMatchObject({ role: 'auditor', tenantId: tA2, membershipRole: 'accountant' })
  })

  it('D3 opción B: un cliente con membresía opera su marca y su rol en la base no cambia', async () => {
    const u = await mkUser('cliente@test', 'consumer')
    loginAs(u)
    expect((await requireAuth(req('/api/a-uno/x'), tA1))?.status).toBe(403) // sin membresía: cliente

    await grant(u._id, orgA, 'brand_manager', { tenantIds: [tA1] })
    clearProjectionCaches()
    expect(await requireAuth(req('/api/a-uno/x'), tA1)).toBeNull()
    expect((await requireAuth(req('/api/b-uno/x'), tB))?.status).toBe(403)
    // Fuera de un comercio sigue siendo cliente.
    expect((await getSessionUser(req('/api/explore/orders')))?.role).toBe('consumer')
    expect((await User.findById(u._id).lean())?.role).toBe('consumer')
  })

  it('un cliente con tenantId cargado no usa el acceso de origen', async () => {
    const u = await mkUser('cliente2@test', 'consumer', tA1)
    loginAs(u)
    expect((await requireAuth(req('/api/a-uno/x'), tA1))?.status).toBe(403)
  })

  it('APIs que no son de comercio: sin proyección', async () => {
    const u = await mkUser('own2@test', 'member')
    await grant(u._id, orgA, 'owner', { allTenants: true })
    loginAs(u)
    for (const p of ['/api/superadmin/tenants', '/api/explore/orders', '/api/grupo/org-a']) {
      const s = await getSessionUser(req(p))
      expect(s?.role).toBe('member')
      expect(s?.tenantId).toBeNull()
    }
  })

  it('superadmin no se proyecta', async () => {
    const u = await mkUser('sa@test', 'superadmin')
    await OrgMembership.collection.insertOne({ organizationId: orgA, userId: u._id, orgRole: 'brand_manager', status: 'active', scope: { allTenants: false, tenantIds: [new mongoose.Types.ObjectId(tA1)], locations: [] } })
    loginAs(u)
    const s = await getSessionUser(req('/api/a-uno/x')) as Record<string, unknown>
    expect(s.role).toBe('superadmin')
    expect(s.via).toBeUndefined()
  })
})

describe('revocación y cortes', () => {
  it('revocar + subir la versión corta en la siguiente lectura', async () => {
    const u = await mkUser('rev@test', 'member')
    const m = await grant(u._id, orgA, 'brand_manager', { tenantIds: [tA1] })
    loginAs(u)
    expect(await requireAuth(req('/api/a-uno/x'), tA1)).toBeNull()
    await OrgMembership.updateOne({ _id: m._id }, { status: 'revoked', revokedAt: new Date() })
    await Organization.updateOne({ _id: orgA }, { $inc: { membershipsVersion: 1 } })
    clearProjectionCaches() // la meta de la org tiene 20 s de caché por instancia
    expect((await requireAuth(req('/api/a-uno/x'), tA1))?.status).toBe(403)
  })

  it('escrituras releen la base: la revocación corta un POST aunque el GET siga en caché', async () => {
    const u = await mkUser('rev2@test', 'member')
    const m = await grant(u._id, orgA, 'brand_manager', { tenantIds: [tA1] })
    loginAs(u)
    expect(await requireAuth(req('/api/a-uno/x'), tA1)).toBeNull()
    await OrgMembership.updateOne({ _id: m._id }, { status: 'revoked' }) // sin subir versión ni limpiar caché
    expect(await requireAuth(req('/api/a-uno/x', 'GET'), tA1)).toBeNull() // caché ≤ 20 s
    expect((await requireAuth(req('/api/a-uno/x', 'POST'), tA1))?.status).toBe(403)
  })

  it('organización suspendida: corta las membresías, no el acceso de origen', async () => {
    const member = await mkUser('susp@test', 'member')
    await grant(member._id, orgA, 'owner', { allTenants: true })
    const homeAdmin = await mkUser('susphome@test', 'admin', tA1)
    await Organization.updateOne({ _id: orgA }, { status: 'suspended' })
    loginAs(member)
    expect((await requireAuth(req('/api/a-uno/x', 'POST'), tA1))?.status).toBe(403)
    loginAs(homeAdmin)
    expect(await requireAuth(req('/api/a-uno/x', 'POST'), tA1)).toBeNull()
  })

  it('desvincular la marca de la organización corta el acceso', async () => {
    const u = await mkUser('unlink@test', 'member')
    await grant(u._id, orgA, 'owner', { allTenants: true })
    loginAs(u)
    expect(await requireAuth(req('/api/a-dos/x'), tA2)).toBeNull()
    await Tenant.updateOne({ _id: tA2 }, { $unset: { organizationId: 1 } })
    expect((await requireAuth(req('/api/a-dos/x', 'POST'), tA2))?.status).toBe(403)
  })

  it('comercio dado de baja: sin acceso por membresía', async () => {
    const u = await mkUser('del@test', 'member')
    await grant(u._id, orgA, 'owner', { allTenants: true })
    await Tenant.updateOne({ _id: tA2 }, { status: 'deleted' })
    loginAs(u)
    expect((await requireAuth(req('/api/a-dos/x'), tA2))?.status).toBe(403)
  })

  it('sessionsValidAfter: una sesión emitida antes del corte deja de valer', async () => {
    const u = await mkUser('sva@test', 'admin', tIndep)
    const issued = Math.floor(Date.now() / 1000) - 3600
    loginAs(u, issued)
    expect(await getSessionUser(req('/api/indep/x'))).not.toBeNull()
    await User.updateOne({ _id: u._id }, { sessionsValidAfter: new Date() })
    expect(await getSessionUser(req('/api/indep/x', 'POST'))).toBeNull()
    // Una sesión nueva (emitida después del corte) sí vale.
    loginAs(u, Math.floor(Date.now() / 1000) + 5)
    expect(await getSessionUser(req('/api/indep/x', 'POST'))).not.toBeNull()
  })
})

describe('org.access = log', () => {
  it('no da acceso y registra la divergencia org_membership', async () => {
    setMode('log')
    const u = await mkUser('log@test', 'member')
    await grant(u._id, orgA, 'brand_manager', { tenantIds: [tA1] })
    loginAs(u)
    expect((await requireAuth(req('/api/a-uno/x'), tA1))?.status).toBe(403)
    await new Promise(r => setTimeout(r, 200)) // recordShadow es asíncrono
    const ev = await AccessShadowEvent.findOne({ family: 'org-projection' }).lean()
    expect(ev).toMatchObject({ reason: 'org_membership', oldDecision: false, newDecision: true, newRole: 'manager', tenantId: tA1 })
  })
})

describe('Mercado Pago queda fuera de la proyección (sin tocar las rutas)', () => {
  it('«Conectar Mercado Pago» rechaza a un owner de la org que no es admin de origen de esa marca', async () => {
    const u = await mkUser('mp@test', 'member')
    await grant(u._id, orgA, 'owner', { allTenants: true })
    loginAs(u)
    const res = await mpConnect(req('/api/a-uno/admin/mp-oauth/connect'), { params: Promise.resolve({ tenant: 'a-uno' }) })
    expect(res.status).toBe(403)
  })
})
