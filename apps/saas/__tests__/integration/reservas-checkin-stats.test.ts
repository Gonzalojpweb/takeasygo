// ============================================================================
// reservas-checkin-stats.test.ts — Check-in con mesa y reportes por sede
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/reservationNotifications', () => ({
  sendReservationConfirmation: vi.fn().mockResolvedValue(undefined),
  sendReservationCancellation: vi.fn().mockResolvedValue(undefined),
}))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Reservation from '@/models/Reservation'
import Table from '@/models/Table'
import { PUT as putReserva } from '@/app/api/[tenant]/reservas/[reservaId]/route'
import { GET as getStats } from '@/app/api/[tenant]/reservas/stats/route'
import { auth } from '@/lib/auth'
import { getTodayStrInTimezone, DEFAULT_TIMEZONE } from '@/lib/restaurant-time'

const SLUG = 'chopis-test'
let tenant: any
let loc1: any
let loc2: any

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({ slug: SLUG, name: 'Chopis', isActive: true, status: 'active', plan: 'full', features: { reservations: true } })
  loc1 = await Location.create({ tenantId: tenant._id, slug: 'a', name: 'Sede A', address: 'A', isActive: true })
  loc2 = await Location.create({ tenantId: tenant._id, slug: 'b', name: 'Sede B', address: 'B', isActive: true })
  setSessionUser({ id: 'a1', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [] })
})

function setSessionUser(user: Record<string, unknown>) {
  vi.mocked(auth).mockResolvedValue({ user, expires: '' } as any)
}

async function reserva(loc: any, status = 'confirmed', date = '2099-01-01', partySize = 2) {
  return Reservation.create({
    tenantId: tenant._id, locationId: loc._id, reservationNumber: `R-${Math.random()}`,
    date, time: '21:00', partySize, name: 'enc', phone: 'enc', status,
    payment: { amount: 0, status: 'approved' },
  })
}

async function mesa(loc: any, number: number, status = 'free') {
  return Table.create({
    posId: `mesa-${loc.slug}-${number}`, tenantId: tenant._id, locationId: loc._id, number, capacity: 4, status,
  })
}

const put = (id: string, body: Record<string, unknown>) =>
  putReserva(
    new NextRequest(`http://localhost/api/${SLUG}/reservas/${id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ tenant: SLUG, reservaId: id }) }
  )

describe('check-in con mesa', () => {
  it('sentar con una mesa libre de la sede: la reserva guarda la mesa y la mesa queda ocupada', async () => {
    const r = await reserva(loc1)
    const t = await mesa(loc1, 5)
    const res = await put(r._id.toString(), { status: 'seated', tablePosId: t.posId })
    expect(res.status).toBe(200)
    expect((await Reservation.findById(r._id).lean() as any).tablePosId).toBe(t.posId)
    expect((await Table.findById(t._id).lean() as any).status).toBe('occupied')
  })

  it('mesa de OTRA sede → 404 y la reserva no cambia', async () => {
    const r = await reserva(loc1)
    const t = await mesa(loc2, 5)
    const res = await put(r._id.toString(), { status: 'seated', tablePosId: t.posId })
    expect(res.status).toBe(404)
    expect((await Reservation.findById(r._id).lean() as any).status).toBe('confirmed')
    expect((await Table.findById(t._id).lean() as any).status).toBe('free')
  })

  it('mesa cerrada (transición inválida) → 409', async () => {
    const r = await reserva(loc1)
    const t = await mesa(loc1, 6, 'closed')
    expect((await put(r._id.toString(), { status: 'seated', tablePosId: t.posId })).status).toBe(409)
  })

  it('mesa con otro estado que no sea sentar → 400', async () => {
    const r = await reserva(loc1)
    const t = await mesa(loc1, 7)
    expect((await put(r._id.toString(), { status: 'cancelled', tablePosId: t.posId })).status).toBe(400)
  })

  it('sentar sin mesa sigue funcionando', async () => {
    const r = await reserva(loc1)
    expect((await put(r._id.toString(), { status: 'seated' })).status).toBe(200)
  })
})

describe('reportes de reservas por sede', () => {
  const today = getTodayStrInTimezone(DEFAULT_TIMEZONE)
  const stats = (qs = '') => getStats(new NextRequest(`http://localhost/api/${SLUG}/reservas/stats${qs}`), { params: Promise.resolve({ tenant: SLUG }) })

  beforeEach(async () => {
    await reserva(loc1, 'seated', today, 4)
    await reserva(loc1, 'seated', today, 2)
    await reserva(loc1, 'no_show', today, 3)
    await reserva(loc1, 'cancelled', today, 2)
    await reserva(loc2, 'seated', today, 5)
    await reserva(loc2, 'seated', '2000-01-01', 9) // fuera de la ventana
  })

  it('consolidado del tenant con desglose por sede', async () => {
    const body = await (await stats()).json()
    expect(body.total).toBe(5)
    expect(body.covers).toBe(11) // 4 + 2 + 5 (sentados)
    expect(body.noShowRate).toBe(25) // 1 no-show / (3 sentadas + 1 no-show)
    expect(body.bySede).toHaveLength(2)
  })

  it('?locationId= filtra la sede', async () => {
    const body = await (await stats(`?locationId=${loc1._id}`)).json()
    expect(body.total).toBe(4)
    expect(body.cancelRate).toBe(25)
  })

  it('usuario de la sede B solo ve B', async () => {
    setSessionUser({ id: 'm1', role: 'manager', tenantId: tenant._id.toString(), assignedLocations: [loc2._id.toString()] })
    const body = await (await stats()).json()
    expect(body.total).toBe(1)
    expect((await stats(`?locationId=${loc1._id}`)).status).toBe(404)
  })
})
