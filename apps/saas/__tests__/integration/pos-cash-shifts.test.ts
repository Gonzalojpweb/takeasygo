import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import CashRegister from '@/models/CashRegister'
import { signJwt } from '@takeasygo/business/jwt'
import { validateShifts, shiftForMinutes, shiftDateFor } from '@takeasygo/business'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

import { POST as registersPost } from '@/app/api/[tenant]/pos/cash/registers/route'
import { POST as closePost } from '@/app/api/[tenant]/pos/cash/registers/[id]/close/route'
import { GET as shiftsToday } from '@/app/api/[tenant]/pos/cash/shifts/route'
import { GET as shiftsGet, PUT as shiftsPut } from '@/app/api/[tenant]/pos/config/shifts/route'

/**
 * Fase 2 (29/10/2026) — turnos de caja: los define el admin; un turno = una
 * caja por jornada; el turno sale de la hora de la sede (Buenos Aires).
 */

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'cafe-demo'
const BASE = `http://localhost:3000/api/${SLUG}/pos`
type Role = 'admin' | 'manager' | 'cashier'
let tenantId: string
let locationId: string

const AUTH = (role: Role) => ({
  authorization: `Bearer ${signJwt({ sub: '64b0000000000000000000a1', tenantId, role, deviceType: 'hub' }, PRIVATE_PEM)}`,
  'x-location-id': locationId,
})
function req(url: string, body?: unknown, role: Role = 'cashier', method = body === undefined ? 'GET' : 'POST'): NextRequest {
  return new Request(url, { method, headers: { 'content-type': 'application/json', ...AUTH(role) }, body: body === undefined ? undefined : JSON.stringify(body) }) as unknown as NextRequest
}
const P = { params: Promise.resolve({ tenant: SLUG }) }
const IP = (id: string) => ({ params: Promise.resolve({ tenant: SLUG, id }) })

const SHIFTS = [
  { id: 'manana', name: 'Mañana', start: '08:00', end: '16:00', active: true },
  { id: 'tarde', name: 'Tarde', start: '16:00', end: '20:00', active: true },
  { id: 'noche', name: 'Noche', start: '20:00', end: '02:00', active: true },
]

async function open(extra: Record<string, unknown> = {}) {
  return registersPost(req(`${BASE}/cash/registers`, { id: crypto.randomUUID(), initialAmount: 100_000, ...extra }), P)
}
async function closeReg(posId: string) {
  return closePost(req(`${BASE}/cash/registers/${posId}/close`, { finalAmount: 100_000 }, 'manager'), IP(posId))
}

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  const tenant = await Tenant.create({ name: 'Café Demo', slug: SLUG, plan: 'try', features: { posEnabled: true } })
  tenantId = tenant._id.toString()
  const loc = await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'Av. Demo 1', isActive: true })
  locationId = loc._id.toString()
  await CashRegister.syncIndexes()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('lógica de turnos (business/shifts)', () => {
  it('valida nombres, horarios y superposición; admite turnos que cruzan la medianoche', () => {
    expect(validateShifts(SHIFTS).ok).toBe(true)
    expect(validateShifts([...SHIFTS, { name: 'Extra', start: '15:00', end: '17:00' }])).toMatchObject({ ok: false })
    expect(validateShifts([{ name: 'A', start: '8:00', end: '12:00' }]).ok).toBe(false)
    expect(validateShifts([{ name: 'A', start: '08:00', end: '12:00' }, { name: 'a', start: '13:00', end: '14:00' }]).ok).toBe(false)
  })

  it('el turno de la hora y la jornada del turno nocturno', () => {
    const v = validateShifts(SHIFTS)
    if (!v.ok) throw new Error(v.error)
    expect(shiftForMinutes(v.shifts, 10 * 60)?.name).toBe('Mañana')
    expect(shiftForMinutes(v.shifts, 90)?.name).toBe('Noche')
    expect(shiftForMinutes(v.shifts, 5 * 60)).toBeNull()
    expect(shiftDateFor(SHIFTS[2], '2026-10-30', 90)).toBe('2026-10-29')
    expect(shiftDateFor(SHIFTS[2], '2026-10-29', 21 * 60)).toBe('2026-10-29')
  })
})

describe('Configuración › Turnos', () => {
  it('los define el admin; el encargado los ve pero no los cambia', async () => {
    expect((await shiftsPut(req(`${BASE}/config/shifts`, { shifts: SHIFTS }, 'manager', 'PUT'), P)).status).toBe(403)
    const res = await shiftsPut(req(`${BASE}/config/shifts`, { shifts: SHIFTS }, 'admin', 'PUT'), P)
    expect(res.status).toBe(200)
    const list = await (await shiftsGet(req(`${BASE}/config/shifts`, undefined, 'manager'), P)).json()
    expect(list.shifts.map((s: { name: string }) => s.name)).toEqual(['Mañana', 'Tarde', 'Noche'])
    const bad = await shiftsPut(req(`${BASE}/config/shifts`, { shifts: [...SHIFTS, { name: 'Pisada', start: '10:00', end: '11:00' }] }, 'admin', 'PUT'), P)
    expect(bad.status).toBe(400)
  })
})

describe('caja por turno', () => {
  beforeEach(async () => {
    await Location.updateOne({ _id: locationId }, { $set: { cashShifts: SHIFTS } })
  })

  it('al abrir toma el turno de la hora; el Z dice el turno; el turno no admite otra caja', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-29T13:00:00Z')) // 10:00 en Buenos Aires
    const a = await open()
    expect(a.status).toBe(201)
    const reg = (await a.json()).register
    expect(reg).toMatchObject({ shiftId: 'manana', shiftName: 'Mañana', shiftDate: '2026-10-29' })

    const status = await (await shiftsToday(req(`${BASE}/cash/shifts`), P)).json()
    expect(status.currentShiftId).toBe('manana')
    expect(status.shifts.map((s: { status: string }) => s.status)).toEqual(['open', 'free', 'free'])

    const closed = await closeReg(reg.id)
    expect(closed.status).toBe(200)
    expect((await closed.json()).register.zReport).toMatchObject({ shiftName: 'Mañana', shiftDate: '2026-10-29' })

    const again = await open()
    expect(again.status).toBe(409)
    expect((await again.json()).error.message).toMatch(/ya se cerró/)

    const tarde = await open({ shiftId: 'tarde' })
    expect(tarde.status).toBe(201)
    expect((await tarde.json()).register.shiftName).toBe('Tarde')
  })

  it('el turno nocturno abierto después de medianoche pertenece a la jornada anterior', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-30T04:30:00Z')) // 01:30 en Buenos Aires
    const res = await open()
    expect((await res.json()).register).toMatchObject({ shiftId: 'noche', shiftDate: '2026-10-29' })
  })

  it('fuera de horario hay que elegir el turno, y un turno inexistente es 400', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-29T08:00:00Z')) // 05:00
    expect((await open()).status).toBe(400)
    expect((await open({ shiftId: 'fantasma' })).status).toBe(400)
    expect((await open({ shiftId: 'manana' })).status).toBe(201)
  })

  it('sin turnos definidos la caja funciona como siempre', async () => {
    await Location.updateOne({ _id: locationId }, { $set: { cashShifts: [] } })
    const res = await open()
    expect(res.status).toBe(201)
    expect((await res.json()).register.shiftId).toBeUndefined()
  })
})
