import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import User from '@/models/User'
import { signJwt } from '@takeasygo/business/jwt'
import { posPinLookup } from '@takeasygo/business/pos-pin'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { rateLimit } from '@/lib/rateLimit'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

import { GET as teamGet, POST as teamPost } from '@/app/api/[tenant]/pos/team/route'
import { PATCH as memberPatch } from '@/app/api/[tenant]/pos/team/[id]/route'
import { POST as memberPin } from '@/app/api/[tenant]/pos/team/[id]/pin/route'
import { GET as meGet } from '@/app/api/[tenant]/pos/me/route'
import { POST as mePin } from '@/app/api/[tenant]/pos/me/pin/route'

/**
 * Fase 3 (29/10/2026) — Usuario y Equipo desde el POS: alta con PIN generado
 * por el server (una sola vez), reglas de quién gestiona a quién y cambio de
 * mi PIN con el actual.
 */

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const PEPPER = 'team-test-pepper-0123456789'
const SLUG = 'cafe-demo'
const BASE = `http://localhost:3000/api/${SLUG}/pos`
let tenantId: string
let locationId: string
let adminId: string
let managerId: string

function req(url: string, as: { id: string; role: string }, body?: unknown, method = body === undefined ? 'GET' : 'POST'): NextRequest {
  const token = signJwt({ sub: as.id, tenantId, role: as.role, deviceType: as.role === 'waiter' ? 'handheld' : 'hub' }, PRIVATE_PEM)
  return new Request(url, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-location-id': locationId }, body: body === undefined ? undefined : JSON.stringify(body) }) as unknown as NextRequest
}
const P = { params: Promise.resolve({ tenant: SLUG }) }
const IP = (id: string) => ({ params: Promise.resolve({ tenant: SLUG, id }) })
const ADMIN = () => ({ id: adminId, role: 'admin' })
const MANAGER = () => ({ id: managerId, role: 'manager' })

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  process.env.POS_PIN_PEPPER = PEPPER
  __resetPosJwtKeyCacheForTests()
})
afterAll(() => { delete process.env.POS_PIN_PEPPER })

beforeEach(async () => {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  const tenant = await Tenant.create({ name: 'Café Demo', slug: SLUG, plan: 'buy', features: { posEnabled: true } })
  tenantId = tenant._id.toString()
  const loc = await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'Av. Demo 1', isActive: true })
  locationId = loc._id.toString()
  adminId = (await User.create({ name: 'Ana Admin', email: 'ana@cafedemo.test', role: 'admin', tenantId, isActive: true }))._id.toString()
  managerId = (await User.create({ name: 'Mario Encargado', email: 'mario@cafedemo.test', role: 'manager', tenantId, isActive: true, assignedLocations: [loc._id] }))._id.toString()
})

describe('Equipo', () => {
  it('el encargado da de alta un mozo: PIN generado una vez, guardado con hash, asignado a la sede', async () => {
    const res = await teamPost(req(`${BASE}/team`, MANAGER(), { name: 'Juan Mozo', role: 'waiter' }), P)
    expect(res.status).toBe(201)
    const { member, pin } = await res.json()
    expect(pin).toMatch(/^\d{6}$/)
    expect(member).toMatchObject({ name: 'Juan Mozo', role: 'waiter', posRole: 'waiter', hasPin: true, webAccess: false })
    const stored = await User.findById(member.id).select('+pin posPinLookup email assignedLocations').lean<{ pin: string; posPinLookup: string; email: string; assignedLocations: mongoose.Types.ObjectId[] }>()
    expect(stored!.pin).not.toBe(pin)
    expect(await bcrypt.compare(pin, stored!.pin)).toBe(true)
    expect(stored!.posPinLookup).toBe(posPinLookup(PEPPER, tenantId, pin))
    expect(stored!.email).toMatch(/\.pos\.invalid$/)
    expect(stored!.assignedLocations.map(String)).toEqual([locationId])
  })

  it('el encargado no crea encargados ni gestiona al admin; el admin sí crea encargados', async () => {
    expect((await teamPost(req(`${BASE}/team`, MANAGER(), { name: 'Otro Encargado', role: 'manager' }), P)).status).toBe(403)
    expect((await memberPin(req(`${BASE}/team/${adminId}/pin`, MANAGER(), {}), IP(adminId))).status).toBe(403)
    expect((await teamPost(req(`${BASE}/team`, ADMIN(), { name: 'Laura Encargada', role: 'manager' }), P)).status).toBe(201)
    expect((await teamPost(req(`${BASE}/team`, ADMIN(), { name: 'X', role: 'admin' }), P)).status).toBe(400)
  })

  it('PIN nuevo invalida el anterior; desactivar corta el acceso; nadie se modifica a sí mismo', async () => {
    const { member, pin } = await (await teamPost(req(`${BASE}/team`, MANAGER(), { name: 'Caro Cajera', role: 'cashier' }), P)).json()
    const reset = await (await memberPin(req(`${BASE}/team/${member.id}/pin`, MANAGER(), {}), IP(member.id))).json()
    expect(reset.pin).not.toBe(pin)
    const stored = await User.findById(member.id).select('+pin').lean<{ pin: string }>()
    expect(await bcrypt.compare(pin, stored!.pin)).toBe(false)

    expect((await memberPatch(req(`${BASE}/team/${member.id}`, MANAGER(), { isActive: false }, 'PATCH'), IP(member.id))).status).toBe(200)
    expect((await User.findById(member.id).lean<{ isActive: boolean }>())!.isActive).toBe(false)
    expect((await memberPatch(req(`${BASE}/team/${managerId}`, MANAGER(), { isActive: false }, 'PATCH'), IP(managerId))).status).toBe(403)
  })

  it('lista solo la gente de esta sede (o de todas) y no muestra emails', async () => {
    await User.create({ name: 'De otra sede', email: 'otra@cafedemo.test', role: 'waiter', tenantId, isActive: true, assignedLocations: [new mongoose.Types.ObjectId()] })
    const { team } = await (await teamGet(req(`${BASE}/team`, MANAGER()), P)).json()
    expect(team.map((m: { name: string }) => m.name).sort()).toEqual(['Ana Admin', 'Mario Encargado'])
    expect(JSON.stringify(team)).not.toContain('@')
  })

  it('el cajero no entra a Equipo', async () => {
    const cajero = await User.create({ name: 'Caja', email: 'caja@cafedemo.test', role: 'cashier', tenantId, isActive: true })
    expect((await teamGet(req(`${BASE}/team`, { id: String(cajero._id), role: 'cashier' }), P)).status).toBe(403)
  })
})

describe('Mi perfil', () => {
  it('cambiar mi PIN exige el actual (y frena los intentos)', async () => {
    const first = await (await mePin(req(`${BASE}/me/pin`, MANAGER(), {}), P)).json()
    expect(first.pin).toMatch(/^\d{6}$/)
    expect((await mePin(req(`${BASE}/me/pin`, MANAGER(), { currentPin: '000000' }), P)).status).toBe(400)
    const second = await mePin(req(`${BASE}/me/pin`, MANAGER(), { currentPin: first.pin }), P)
    expect(second.status).toBe(201)
    // El límite (5 cada 15 min por usuario) lo aplica rateLimit: agotado ⇒ 429.
    vi.mocked(rateLimit).mockResolvedValueOnce({ success: false, remaining: 0 })
    expect((await mePin(req(`${BASE}/me/pin`, MANAGER(), { currentPin: '111111' }), P)).status).toBe(429)
    expect(vi.mocked(rateLimit).mock.calls.at(-1)?.slice(1)).toEqual([5, 15 * 60_000])
  })

  it('muestra mis datos y la sede', async () => {
    const me = await (await meGet(req(`${BASE}/me`, MANAGER()), P)).json()
    expect(me).toMatchObject({ name: 'Mario Encargado', role: 'manager', posRole: 'manager', locationName: 'Centro', hasPin: false, closes: [] })
  })
})
