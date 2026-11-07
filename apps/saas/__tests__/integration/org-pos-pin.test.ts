import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import { auth } from '@/lib/auth'
import { clearFreshUserCache } from '@/lib/apiAuth'
import { clearProjectionCaches } from '@/lib/organizations/projection'
import { clearOrgAccessModeCache, clearPosMultiBrandCache } from '@/lib/org-access'
import { posPinLookup, resolvePosPinPepper } from '@takeasygo/business/pos-pin'
import { revokeMember, unlinkTenant } from '@/lib/organizations/service'
import { GET, POST, DELETE } from '@/app/api/grupo/pos-pin/route'
import Organization from '@/models/Organization'
import OrgMembership from '@/models/OrgMembership'
import PosCredential from '@/models/PosCredential'
import Tenant from '@/models/Tenant'
import User from '@/models/User'

/** POS multimarca (D6): el miembro saca su PIN por marca en /grupo. */

const authMock = vi.mocked(auth)
const SA = { userId: null, name: 'SA', role: 'superadmin' }
let orgA: mongoose.Types.ObjectId, tA1: string, tA2: string, tOut: string

const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/grupo/pos-pin', { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

async function mk(email: string, role = 'member', tenantId: string | null = null) {
  return User.create({ name: email, email, password: 'Pass-123456!', role, tenantId, phone: `+54911${Math.floor(Math.random() * 1e8)}` })
}
function loginAs(u: { _id: unknown; role: string; tenantId?: unknown }) {
  authMock.mockResolvedValue({ user: { id: String(u._id), role: u.role, email: 'x@t', name: 'X', tenantId: u.tenantId ? String(u.tenantId) : null, tenantSlug: null, assignedLocations: [], issuedAt: Math.floor(Date.now() / 1000) } } as never)
}
function flags(pos: 'on' | 'off', org: 'enforce' | 'log') {
  process.env.POS_MULTIBRAND_MODE = pos
  process.env.ORG_ACCESS_MODE = org
  clearPosMultiBrandCache()
  clearOrgAccessModeCache()
}

beforeEach(async () => {
  await mongoose.connection.dropDatabase()
  clearFreshUserCache()
  clearProjectionCaches()
  process.env.POS_PIN_PEPPER = 'test-pepper-0123456789abcdef'
  flags('on', 'enforce')
  orgA = (await Organization.create({ name: 'Grupo A', slug: 'grupo-a' }))._id
  tA1 = String((await Tenant.create({ name: 'Alfa', slug: 'alfa', plan: 'full', organizationId: orgA }))._id)
  tA2 = String((await Tenant.create({ name: 'Beta', slug: 'beta', plan: 'full', organizationId: orgA }))._id)
  tOut = String((await Tenant.create({ name: 'Afuera', slug: 'afuera', plan: 'full' }))._id)
  await PosCredential.init()
})

afterEach(() => {
  delete process.env.POS_MULTIBRAND_MODE
  delete process.env.ORG_ACCESS_MODE
  delete process.env.POS_PIN_PEPPER
})

describe('PIN del POS de un miembro', () => {
  it('el propietario saca su PIN de una marca: 6 dígitos, guardado como bcrypt + lookup, se ve una sola vez', async () => {
    const u = await mk('owner@t.test')
    await OrgMembership.create({ organizationId: orgA, userId: u._id, orgRole: 'owner', scope: { allTenants: true } })
    loginAs(u)
    const res = await POST(req('POST', { tenantSlug: 'alfa' }))
    expect(res.status).toBe(200)
    const { pin } = await res.json()
    expect(pin).toMatch(/^\d{6}$/)
    const cred = await PosCredential.findOne({ userId: u._id, tenantId: tA1 }).select('+pin +posPinLookup').lean()
    expect(await bcrypt.compare(pin, cred!.pin)).toBe(true)
    expect(cred!.posPinLookup).toBe(posPinLookup(resolvePosPinPepper(process.env)!, tA1, pin))
    const list = await (await GET(req('GET'))).json()
    expect(list.credentials.map((c: { tenantId: string }) => c.tenantId)).toEqual([tA1])
    expect(JSON.stringify(list)).not.toContain(pin)

    // Uno nuevo reemplaza al anterior (sigue habiendo uno solo por marca).
    const again = await (await POST(req('POST', { tenantSlug: 'alfa' }))).json()
    expect(await PosCredential.countDocuments({ userId: u._id, tenantId: tA1 })).toBe(1)
    expect(again.pin).toMatch(/^\d{6}$/)
  })

  it('interruptor apagado u org.access no activo → 409', async () => {
    const u = await mk('owner@t.test')
    await OrgMembership.create({ organizationId: orgA, userId: u._id, orgRole: 'owner', scope: { allTenants: true } })
    loginAs(u)
    flags('off', 'enforce')
    expect((await POST(req('POST', { tenantSlug: 'alfa' }))).status).toBe(409)
    flags('on', 'log')
    expect((await POST(req('POST', { tenantSlug: 'alfa' }))).status).toBe(409)
  })

  it('marca fuera de su alcance o de afuera → 404; contador → 403; su comercio de origen → 409', async () => {
    const bm = await mk('bm@t.test')
    await OrgMembership.create({ organizationId: orgA, userId: bm._id, orgRole: 'brand_manager', scope: { tenantIds: [tA1] } })
    loginAs(bm)
    expect((await POST(req('POST', { tenantSlug: 'beta' }))).status).toBe(404)
    expect((await POST(req('POST', { tenantSlug: 'afuera' }))).status).toBe(404)

    const acc = await mk('acc@t.test')
    await OrgMembership.create({ organizationId: orgA, userId: acc._id, orgRole: 'accountant', scope: { allTenants: true } })
    loginAs(acc)
    expect((await POST(req('POST', { tenantSlug: 'alfa' }))).status).toBe(403)

    const homeAdmin = await mk('admin@t.test', 'admin', tA1)
    await OrgMembership.create({ organizationId: orgA, userId: homeAdmin._id, orgRole: 'owner', scope: { allTenants: true } })
    loginAs(homeAdmin)
    expect((await POST(req('POST', { tenantSlug: 'alfa' }))).status).toBe(409)
    expect((await POST(req('POST', { tenantSlug: 'beta' }))).status).toBe(200) // otra marca del grupo: sí
    void tOut
  })

  it('borrar el PIN; revocar la membresía o desvincular la marca también lo borra', async () => {
    const u = await mk('owner@t.test')
    const m = await OrgMembership.create({ organizationId: orgA, userId: u._id, orgRole: 'owner', scope: { allTenants: true } })
    const u2 = await mk('owner2@t.test')
    await OrgMembership.create({ organizationId: orgA, userId: u2._id, orgRole: 'owner', scope: { allTenants: true } })
    loginAs(u)
    await POST(req('POST', { tenantSlug: 'alfa' }))
    await POST(req('POST', { tenantSlug: 'beta' }))
    expect((await DELETE(req('DELETE', { tenantSlug: 'alfa' }))).status).toBe(200)
    expect(await PosCredential.countDocuments({ userId: u._id })).toBe(1)

    loginAs(u2)
    await POST(req('POST', { tenantSlug: 'beta' }))
    await unlinkTenant(String(orgA), tA2, SA)
    expect(await PosCredential.countDocuments({ tenantId: tA2 })).toBe(0)

    loginAs(u)
    await POST(req('POST', { tenantSlug: 'alfa' }))
    await revokeMember(String(orgA), String(m._id), null, SA)
    expect(await PosCredential.countDocuments({ userId: u._id })).toBe(0)
  })
})
