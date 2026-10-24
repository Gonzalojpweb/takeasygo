import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Table from '@/models/Table'
import Reservation from '@/models/Reservation'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import { getTodayStrInTimezone } from '@/lib/restaurant-time'
import type { NextRequest } from 'next/server'

import { GET as sectorsGet } from '@/app/api/[tenant]/pos/sectors/route'
import { GET as tablesGet, POST as tablesPost } from '@/app/api/[tenant]/pos/tables/route'
import { PATCH as tablePatch } from '@/app/api/[tenant]/pos/tables/[id]/route'
import { GET as reservationsGet } from '@/app/api/[tenant]/pos/reservations/route'
import { POST as reservationsSeen } from '@/app/api/[tenant]/pos/reservations/seen/route'
import { PATCH as reservationPatch } from '@/app/api/[tenant]/pos/reservations/[id]/route'

/**
 * Observación 24/10 — sectores centralizados (SaaS → POS) y reservas en el POS:
 *   · los sectores del POS son los espacios de la sede (Location.spaces).
 *   · una reserva confirmada puede reservar una mesa; sentarla la ocupa con
 *     sus comensales; no-show la libera.
 *   · reservas nuevas sin ver = badge (compartido SaaS/POS).
 */

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'test-tenant'
const BASE = `http://localhost:3000/api/${SLUG}/pos`

let tenantId: string
let locationId: string
let salonId: string
let terrazaId: string

function token(role: 'cashier' | 'waiter' = 'cashier'): string {
  return signJwt({ sub: '64b0000000000000000000a1', tenantId, role, deviceType: 'hub' }, PRIVATE_PEM)
}
const AUTH = (role: 'cashier' | 'waiter' = 'cashier') => ({ authorization: `Bearer ${token(role)}`, 'x-location-id': locationId })

function req(url: string, body?: unknown, headers: Record<string, string> = AUTH(), method = 'POST'): NextRequest {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest
}
const listParams = { params: Promise.resolve({ tenant: SLUG }) }
const idParams = (id: string) => ({ params: Promise.resolve({ tenant: SLUG, id }) })

async function createTable(number: number, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await tablesPost(req(`${BASE}/tables`, { id: crypto.randomUUID(), number, capacity: 4, ...extra }), listParams)
  expect(res.status).toBe(201)
  return (await res.json()).table.id
}

async function createReservation(extra: Record<string, unknown> = {}) {
  return Reservation.create({
    tenantId,
    locationId,
    reservationNumber: String(Math.floor(Math.random() * 1e6)),
    date: getTodayStrInTimezone('America/Argentina/Buenos_Aires'),
    time: '21:00',
    partySize: 3,
    name: 'Ana Pérez',
    phone: '+54 11 5555-1234',
    status: 'confirmed',
    spaceId: new mongoose.Types.ObjectId(terrazaId),
    ...extra,
  })
}

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  const tenant = await Tenant.create({ name: 'Test Tenant', slug: SLUG, plan: 'full' })
  tenantId = tenant._id.toString()
  const loc = await Location.create({
    tenantId,
    name: 'Local Centro',
    slug: 'centro',
    address: 'Av. Siempreviva 742',
    isActive: true,
    spaces: [
      { name: 'Salón', capacity: 40, order: 0 },
      { name: 'Terraza', capacity: 20, order: 1 },
    ],
  })
  locationId = loc._id.toString()
  salonId = String(loc.spaces![0]._id)
  terrazaId = String(loc.spaces![1]._id)
})

describe('Sectores = espacios de la sede', () => {
  it('GET /pos/sectors devuelve los espacios del SaaS en orden', async () => {
    const res = await sectorsGet(req(`${BASE}/sectors`, undefined, AUTH(), 'GET'), listParams)
    expect((await res.json()).sectors.map((s: { name: string }) => s.name)).toEqual(['Salón', 'Terraza'])
  })

  it('la mesa nueva va al sector elegido (o al primero) y un sector ajeno es 400', async () => {
    const a = await createTable(1, { spaceId: terrazaId })
    const b = await createTable(2)
    const stored = await Table.find({ posId: { $in: [a, b] } }).sort({ number: 1 }).lean()
    expect(stored.map((t) => [String(t.spaceId), t.section])).toEqual([[terrazaId, 'Terraza'], [salonId, 'Salón']])

    const bad = await tablesPost(req(`${BASE}/tables`, { id: crypto.randomUUID(), number: 3, capacity: 2, spaceId: new mongoose.Types.ObjectId().toString() }), listParams)
    expect(bad.status).toBe(400)
  })

  it('si el SaaS renombra el espacio, el POS lo lista con el nombre nuevo; mover de sector es de caja', async () => {
    const id = await createTable(1, { spaceId: terrazaId })
    await Location.updateOne({ _id: locationId, 'spaces._id': terrazaId }, { $set: { 'spaces.$.name': 'Patio' } })
    const list = await (await tablesGet(req(`${BASE}/tables`, undefined, AUTH(), 'GET'), listParams)).json()
    expect(list.tables[0]).toMatchObject({ section: 'Patio', spaceId: terrazaId })

    expect((await tablePatch(req(`${BASE}/tables/${id}`, { spaceId: salonId }, AUTH('waiter'), 'PATCH'), idParams(id))).status).toBe(403)
    const moved = await tablePatch(req(`${BASE}/tables/${id}`, { spaceId: salonId }, AUTH(), 'PATCH'), idParams(id))
    expect((await moved.json()).table).toMatchObject({ section: 'Salón', spaceId: salonId })
  })
})

describe('Reservas en el POS', () => {
  it('lista las de hoy con sector, teléfono enmascarado y badge de nuevas; ver las marca vistas', async () => {
    await createReservation()
    const res = await reservationsGet(req(`${BASE}/reservations`, undefined, AUTH(), 'GET'), listParams)
    const body = await res.json()
    expect(body.unseen).toBe(1)
    expect(body.reservations[0]).toMatchObject({ name: 'Ana Pérez', partySize: 3, spaceName: 'Terraza', phoneTail: '1234', isNew: true })
    expect(JSON.stringify(body)).not.toContain('5555-1234')

    await reservationsSeen(req(`${BASE}/reservations/seen`), listParams)
    const after = await (await reservationsGet(req(`${BASE}/reservations`, undefined, AUTH(), 'GET'), listParams)).json()
    expect(after.unseen).toBe(0)
  })

  it('asignar reserva la mesa; sentar la ocupa con los comensales', async () => {
    const tableId = await createTable(5, { spaceId: terrazaId })
    const r = await createReservation()

    const assigned = await reservationPatch(req(`${BASE}/reservations/${r._id}`, { action: 'assign', tablePosId: tableId }, AUTH(), 'PATCH'), idParams(String(r._id)))
    expect(assigned.status).toBe(200)
    expect(await Table.findOne({ posId: tableId }).lean()).toMatchObject({ status: 'reserved' })
    expect(String((await Table.findOne({ posId: tableId }).lean())!.reservationId)).toBe(String(r._id))

    const seated = await reservationPatch(req(`${BASE}/reservations/${r._id}`, { action: 'seat' }, AUTH(), 'PATCH'), idParams(String(r._id)))
    expect((await seated.json()).reservation).toMatchObject({ status: 'seated', tablePosId: tableId })
    expect(await Table.findOne({ posId: tableId }).lean()).toMatchObject({ status: 'occupied', guests: 3, reservationId: null })
  })

  it('no vino libera la mesa reservada; una mesa ocupada no se reserva; el mozo no opera reservas', async () => {
    const tableId = await createTable(6)
    const r = await createReservation()
    await reservationPatch(req(`${BASE}/reservations/${r._id}`, { action: 'assign', tablePosId: tableId }, AUTH(), 'PATCH'), idParams(String(r._id)))

    const waiter = await reservationPatch(req(`${BASE}/reservations/${r._id}`, { action: 'no_show' }, AUTH('waiter'), 'PATCH'), idParams(String(r._id)))
    expect(waiter.status).toBe(403)

    const noShow = await reservationPatch(req(`${BASE}/reservations/${r._id}`, { action: 'no_show' }, AUTH(), 'PATCH'), idParams(String(r._id)))
    expect(noShow.status).toBe(200)
    expect(await Table.findOne({ posId: tableId }).lean()).toMatchObject({ status: 'free', reservationId: null })

    const busy = await createTable(7)
    await tablePatch(req(`${BASE}/tables/${busy}`, { status: 'occupied' }, AUTH(), 'PATCH'), idParams(busy))
    const r2 = await createReservation()
    const blocked = await reservationPatch(req(`${BASE}/reservations/${r2._id}`, { action: 'assign', tablePosId: busy }, AUTH(), 'PATCH'), idParams(String(r2._id)))
    expect(blocked.status).toBe(409)
  })
})
