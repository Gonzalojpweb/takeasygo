// ============================================================================
// display-pairing.test.ts — vinculación de pantallas (Entrega B, 21/11/2026)
// ============================================================================
// Código de 6 caracteres que vence; nonce para retirar el token UNA vez; token
// hasheado y revocable; aislamiento entre comercios y sedes; nada de IP ni
// user agent en la base.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rateLimit', () => ({ rateLimit: vi.fn().mockResolvedValue({ success: true }) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import DisplayDevice from '@/models/DisplayDevice'
import { POST as pairStart } from '@/app/api/display/pair/start/route'
import { POST as pairStatus } from '@/app/api/display/pair/status/route'
import { GET as manifest } from '@/app/api/display/manifest/route'
import { POST as claim } from '@/app/api/[tenant]/displays/claim/route'
import { GET as listDisplays } from '@/app/api/[tenant]/displays/route'
import { DELETE as revoke, PATCH as patchDisplay } from '@/app/api/[tenant]/displays/[deviceId]/route'
import { rateLimit } from '@/lib/rateLimit'
import { auth } from '@/lib/auth'
import { generateCode, normalizeCode, CODE_ALPHABET } from '@/lib/display/auth'

let A: any, B: any, locA1: any, locA2: any, locB: any
const NONCE = 'n'.repeat(40)
const IP = '203.0.113.77'
const UA = 'Mozilla/5.0 (Linux; Android 9; TV Box X96)'

beforeEach(async () => {
  vi.clearAllMocks()
  vi.mocked(rateLimit).mockResolvedValue({ success: true } as any)
  A = await Tenant.create({ slug: 'disp-a', name: 'A', isActive: true, status: 'active', plan: 'full' })
  B = await Tenant.create({ slug: 'disp-b', name: 'B', isActive: true, status: 'active', plan: 'full' })
  locA1 = await Location.create({ tenantId: A._id, slug: 'a1', name: 'Sede A1', address: 'x', isActive: true })
  locA2 = await Location.create({ tenantId: A._id, slug: 'a2', name: 'Sede A2', address: 'x', isActive: true })
  locB = await Location.create({ tenantId: B._id, slug: 'b1', name: 'Sede B1', address: 'x', isActive: true })
})

const json = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': IP, 'user-agent': UA, ...headers }, body: JSON.stringify(body) })
const asUser = (role: string, tenant: any, locs: any[] = []) =>
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role, tenantId: String(tenant._id), assignedLocations: locs.map((l) => String(l._id)) }, expires: '' } as any)

async function start(nonce = NONCE) {
  const res = await pairStart(json('/api/display/pair/start', { nonce }))
  return { res, body: await res.json() }
}
const status = (pairingId: string, nonce = NONCE) => pairStatus(json('/api/display/pair/status', { pairingId, nonce }))
const claimAs = (slug: string, body: Record<string, unknown>) => claim(json(`/api/${slug}/displays/claim`, body), { params: Promise.resolve({ tenant: slug }) })

describe('código', () => {
  it('6 caracteres del alfabeto sin O/0/I/1; se normaliza lo que tipea el comercio', () => {
    const c = generateCode()
    expect(c).toMatch(new RegExp(`^[${CODE_ALPHABET}]{6}$`))
    expect(CODE_ALPHABET).not.toMatch(/[O0I1]/)
    expect(normalizeCode(' ab3-x7k ')).toBe('AB3X7K')
    expect(normalizeCode('AB0X7K')).toBeNull()
    expect(normalizeCode('ABC')).toBeNull()
  })
})

describe('vinculación de punta a punta', () => {
  it('pide código → el comercio lo reclama → la pantalla retira el token UNA vez → lee su manifiesto', async () => {
    const { res, body } = await start()
    expect(res.status).toBe(201)
    expect(body.code).toMatch(/^[A-Z2-9]{6}$/)
    expect(body.linkUrl).toContain(`/pantalla/vincular?code=${body.code}`)
    expect((await (await status(body.pairingId)).json()).status).toBe('pending')

    asUser('admin', A)
    const c = await claimAs('disp-a', { code: body.code.toLowerCase(), locationId: String(locA1._id), name: 'Tótem caja', orientation: 'portrait' })
    expect(c.status).toBe(201)

    const got = await (await status(body.pairingId)).json()
    expect(got).toMatchObject({ status: 'active', device: { name: 'Tótem caja', orientation: 'portrait', locationName: 'Sede A1' } })
    expect(got.token).toMatch(/^tgd_[a-f0-9]{48}$/)
    const again = await status(body.pairingId)
    expect(again.status).toBe(410)
    expect((await again.json()).status).toBe('used')

    const m = await manifest(new NextRequest('http://localhost/api/display/manifest', { headers: { authorization: `Bearer ${got.token}` } }))
    expect(m.status).toBe(200)
  })

  it('nonce equivocado → 403; con 5 intentos el código se anula', async () => {
    const { body } = await start()
    for (let i = 0; i < 4; i++) expect((await status(body.pairingId, 'x'.repeat(40))).status).toBe(403)
    expect((await status(body.pairingId, 'x'.repeat(40))).status).toBe(403)
    expect(await DisplayDevice.countDocuments({ _id: body.pairingId })).toBe(0)
    expect((await status(body.pairingId)).status).toBe(410)
  })

  it('código vencido o inexistente → 404 al reclamarlo', async () => {
    const { body } = await start()
    await DisplayDevice.updateOne({ _id: body.pairingId }, { $set: { pairingExpiresAt: new Date(Date.now() - 1000) } })
    asUser('admin', A)
    expect((await claimAs('disp-a', { code: body.code, locationId: String(locA1._id), name: 'X', orientation: 'landscape' })).status).toBe(404)
    expect((await claimAs('disp-a', { code: 'ZZZZZZ', locationId: String(locA1._id), name: 'X', orientation: 'landscape' })).status).toBe(404)
    expect((await status(body.pairingId)).status).toBe(410)
  })

  it('límite por IP (hasheada) al pedir códigos → 429', async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce({ success: false } as any)
    expect((await start()).res.status).toBe(429)
    const keys = vi.mocked(rateLimit).mock.calls.map((c) => String(c[0]))
    expect(keys.some((k) => k.includes(IP))).toBe(false)
    expect(keys[0]).toMatch(/^display-pair10m:[a-f0-9]{32}$/)
  })
})

describe('aislamiento', () => {
  it('sede de otro comercio → 404; encargado de otra sede → 404; cajero → sin acceso', async () => {
    const { body } = await start()
    asUser('admin', A)
    expect((await claimAs('disp-a', { code: body.code, locationId: String(locB._id), name: 'X', orientation: 'landscape' })).status).toBe(404)
    asUser('manager', A, [locA2])
    expect((await claimAs('disp-a', { code: body.code, locationId: String(locA1._id), name: 'X', orientation: 'landscape' })).status).toBe(404)
    asUser('cashier', A)
    expect((await claimAs('disp-a', { code: body.code, locationId: String(locA1._id), name: 'X', orientation: 'landscape' })).status).toBeGreaterThanOrEqual(401)
    expect((await DisplayDevice.findById(body.pairingId).lean())!.status).toBe('pending')
  })

  it('el comercio B no ve ni revoca pantallas de A; revocar deja el token sin efecto', async () => {
    const { body } = await start()
    asUser('admin', A)
    await claimAs('disp-a', { code: body.code, locationId: String(locA1._id), name: 'TV', orientation: 'landscape' })
    const { token } = await (await status(body.pairingId)).json()

    asUser('admin', B)
    const listB = await (await listDisplays(new NextRequest('http://localhost/api/disp-b/displays'), { params: Promise.resolve({ tenant: 'disp-b' }) })).json()
    expect(listB.devices).toEqual([])
    const ctxB = { params: Promise.resolve({ tenant: 'disp-b', deviceId: body.pairingId }) }
    expect((await revoke(new NextRequest(`http://localhost/api/disp-b/displays/${body.pairingId}`, { method: 'DELETE' }), ctxB)).status).toBe(404)

    asUser('admin', A)
    const listA = await (await listDisplays(new NextRequest('http://localhost/api/disp-a/displays'), { params: Promise.resolve({ tenant: 'disp-a' }) })).json()
    expect(listA.devices).toHaveLength(1)
    expect(JSON.stringify(listA)).not.toMatch(/tokenHash|codeHash|nonceHash/)
    const ctxA = { params: Promise.resolve({ tenant: 'disp-a', deviceId: body.pairingId }) }
    const p = await patchDisplay(new NextRequest(`http://localhost/api/disp-a/displays/${body.pairingId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'TV salón', locationId: String(locB._id) }) }), ctxA)
    expect(p.status).toBe(404) // no se puede mover a una sede de otro comercio
    expect((await revoke(new NextRequest(`http://localhost/api/disp-a/displays/${body.pairingId}`, { method: 'DELETE' }), ctxA)).status).toBe(200)
    const m = await manifest(new NextRequest('http://localhost/api/display/manifest', { headers: { authorization: `Bearer ${token}` } }))
    expect(m.status).toBe(401)
  })
})

describe('privacidad', () => {
  it('ni IP, ni user agent, ni código, nonce o token en claro en la base', async () => {
    const { body } = await start()
    asUser('admin', A)
    await claimAs('disp-a', { code: body.code, locationId: String(locA1._id), name: 'TV', orientation: 'landscape' })
    const { token } = await (await status(body.pairingId)).json()
    const doc = await DisplayDevice.collection.findOne({ _id: new mongoose.Types.ObjectId(body.pairingId) })
    const text = JSON.stringify(doc)
    for (const secret of [IP, UA, 'TV Box', body.code, NONCE, token]) expect(text).not.toContain(secret)
    expect(Object.keys(doc!)).not.toEqual(expect.arrayContaining(['ip']))
    expect(doc!.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(doc!.pairing).toBeUndefined()
    expect(doc!.pairingExpiresAt).toBeUndefined()
  })
})
