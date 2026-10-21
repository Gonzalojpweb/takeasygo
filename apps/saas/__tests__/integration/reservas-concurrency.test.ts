// ============================================================================
// reservas-concurrency.test.ts — R-1: sin sobreventa de franjas
// ============================================================================
// N altas concurrentes sobre la misma franja con cupo 1: exactamente una gana
// y el resto recibe 409. También con franjas que se solapan por duración
// (19:00 y 19:30 con bloques de 90 min). El lock libera siempre.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/reservationNotifications', () => ({
  sendReservationConfirmation: vi.fn().mockResolvedValue(undefined),
}))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Reservation from '@/models/Reservation'
import mongoose from 'mongoose'
import type { NextRequest } from 'next/server'
import { POST as reservasPost } from '@/app/api/[tenant]/reservas/route'

const params = { params: Promise.resolve({ tenant: 'conc-tenant' }) }
const DATE = '2099-06-15' // fecha futura fija: sin depender del reloj
let locationId: string

function req(body: Record<string, unknown>): NextRequest {
  return new Request('http://localhost:3000/api/conc-tenant/reservas', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

const body = (time: string, i: number) => ({
  locationId, date: DATE, time, partySize: 2, name: `Cliente ${i}`, phone: `+54911000000${i}`,
})

beforeEach(async () => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32).toString('base64')
  const tenant = await Tenant.create({
    name: 'Conc', slug: 'conc-tenant', plan: 'full', features: { reservations: true },
  })
  const location = await Location.create({
    tenantId: tenant._id, name: 'Sede', slug: 'sede', address: 'X', isActive: true,
    timezone: 'America/Argentina/Buenos_Aires',
    reservationConfig: {
      enabled: true,
      minPayment: 0,
      maxPartySize: 10,
      slotConfig: {
        enabled: true,
        operatingHours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: '18:00', close: '23:00' }],
        slotIntervalMinutes: 30,
        blockDurationMinutes: 90,
        maxReservationsPerSlot: 1,
      },
    },
  })
  locationId = String(location._id)
})

describe('R-1 — concurrencia de reservas', () => {
  it('5 altas simultáneas en la misma franja con cupo 1 → exactamente 1 gana', async () => {
    const results = await Promise.all([0, 1, 2, 3, 4].map(i => reservasPost(req(body('20:00', i)), params)))
    const statuses = results.map(r => r.status).sort()
    expect(statuses.filter(s => s === 201)).toHaveLength(1)
    expect(statuses.filter(s => s === 409)).toHaveLength(4)
    expect(await Reservation.countDocuments({ date: DATE })).toBe(1)
  })

  it('franjas que se solapan por duración (19:00 y 19:30, bloque 90 min) → una sola gana', async () => {
    const results = await Promise.all([
      reservasPost(req(body('19:00', 1)), params),
      reservasPost(req(body('19:30', 2)), params),
    ])
    expect(results.filter(r => r.status === 201)).toHaveLength(1)
    expect(await Reservation.countDocuments({ date: DATE })).toBe(1)
  })

  it('franjas que no se solapan (18:00 y 21:00) → ambas ganan', async () => {
    const results = await Promise.all([
      reservasPost(req(body('18:00', 1)), params),
      reservasPost(req(body('21:00', 2)), params),
    ])
    expect(results.map(r => r.status)).toEqual([201, 201])
  })

  it('el lock queda libre después de cada alta (incluidas las rechazadas)', async () => {
    await Promise.all([0, 1, 2].map(i => reservasPost(req(body('20:00', i)), params)))
    const locks = await mongoose.connection.collection('reservation_locks').find({}).toArray()
    expect(locks.every(l => l.owner === null && l.lockedUntil === null)).toBe(true)
  })

  it('anticipación máxima: una fecha más allá del límite → 400', async () => {
    await Location.updateOne({ _id: locationId }, { $set: { 'reservationConfig.maxAdvanceDays': 30 } })
    const res = await reservasPost(req(body('20:00', 9)), params)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('30 días')
  })
})
