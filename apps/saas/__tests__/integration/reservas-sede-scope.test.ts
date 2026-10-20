// ============================================================================
// reservas-sede-scope.test.ts — PUT /reservas/[reservaId] con sede ajena
// ============================================================================
// Un usuario con sedes asignadas no puede confirmar/cancelar reservas de otra
// sede (404, sin filtrar existencia). Guard siempre activo, sin flag.
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
import * as reservaRoute from '@/app/api/[tenant]/reservas/[reservaId]/route'
import { auth } from '@/lib/auth'
import { sendReservationCancellation } from '@/lib/reservationNotifications'

let tenant: any
let loc1: any
let loc2: any
let resL2: any

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({
    slug: 'chopis-test',
    name: 'Chopis (test)',
    isActive: true,
    status: 'active',
    plan: 'full',
    features: { reservations: true },
  })
  loc1 = await Location.create({
    tenantId: tenant._id, slug: 'sede-a', name: 'Sede A', address: 'A 1', isActive: true,
  })
  loc2 = await Location.create({
    tenantId: tenant._id, slug: 'sede-b', name: 'Sede B', address: 'B 2', isActive: true,
  })
  resL2 = await Reservation.create({
    tenantId: tenant._id,
    locationId: loc2._id,
    reservationNumber: 'R-0001',
    date: '2026-12-01',
    time: '21:00',
    partySize: 2,
    name: 'enc',
    phone: 'enc',
    status: 'confirmed',
    payment: { amount: 0, status: 'approved' },
  })
})

function setSessionUser(user: Record<string, unknown>) {
  vi.mocked(auth).mockResolvedValue({ user, expires: '' } as any)
}

function put(id: string, status: string) {
  return reservaRoute.PUT(
    new NextRequest(`http://localhost/api/chopis-test/reservas/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
    { params: Promise.resolve({ tenant: 'chopis-test', reservaId: id }) }
  )
}

describe('PUT /reservas/[reservaId] — scope de sede', () => {
  it('usuario scoped a L1 cancela reserva de L2 → 404 y no cambia nada', async () => {
    setSessionUser({ id: 'u1', role: 'manager', tenantId: tenant._id.toString(), assignedLocations: [loc1._id.toString()] })
    const res = await put(resL2._id.toString(), 'cancelled')
    expect(res.status).toBe(404)
    const after = await Reservation.findById(resL2._id).lean() as any
    expect(after.status).toBe('confirmed')
    expect(sendReservationCancellation).not.toHaveBeenCalled()
  })

  it('admin scoped a L1 tampoco opera L2 → 404', async () => {
    setSessionUser({ id: 'u2', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [loc1._id.toString()] })
    const res = await put(resL2._id.toString(), 'no_show')
    expect(res.status).toBe(404)
  })

  it('usuario scoped a L2 opera su sede → 200', async () => {
    setSessionUser({ id: 'u3', role: 'manager', tenantId: tenant._id.toString(), assignedLocations: [loc2._id.toString()] })
    const res = await put(resL2._id.toString(), 'seated')
    expect(res.status).toBe(200)
    const after = await Reservation.findById(resL2._id).lean() as any
    expect(after.status).toBe('seated')
  })

  it('usuario sin sedes asignadas (rol de tenant) → 200 (no regresión)', async () => {
    setSessionUser({ id: 'u4', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [] })
    const res = await put(resL2._id.toString(), 'cancelled')
    expect(res.status).toBe(200)
  })

  it('usuario de otro tenant → 403', async () => {
    setSessionUser({ id: 'u5', role: 'admin', tenantId: '507f1f77bcf86cd799439011', assignedLocations: [] })
    const res = await put(resL2._id.toString(), 'cancelled')
    expect(res.status).toBe(403)
  })

  it('id malformado → 404 sin CastError', async () => {
    setSessionUser({ id: 'u4', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [] })
    const res = await put('no-es-un-id', 'cancelled')
    expect(res.status).toBe(404)
  })

  it('no existe GET público por id (datos personales)', () => {
    expect((reservaRoute as Record<string, unknown>).GET).toBeUndefined()
  })
})
