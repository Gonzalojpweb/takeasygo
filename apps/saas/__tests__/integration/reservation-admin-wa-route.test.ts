import { describe, it, expect, beforeEach, vi } from 'vitest'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/reservationNotifications', () => ({
  sendReservationConfirmation: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/whatsapp', () => ({
  sendWhatsApp: vi.fn().mockResolvedValue(undefined),
}))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Reservation from '@/models/Reservation'
import { sendWhatsApp } from '@/lib/whatsapp'
import { sendReservationConfirmation } from '@/lib/reservationNotifications'
import type { NextRequest } from 'next/server'
import { POST as reservasPost } from '@/app/api/[tenant]/reservas/route'

/**
 * WhatsApp al admin en la creación de reservas: el mensaje de creación debe
 * incluir código/sede/teléfono/notas, suprimirse si la reserva es gratis (la
 * confirmación con info completa sale en el mismo request) y respetar el
 * override de WhatsApp por sede.
 */

const params = { params: Promise.resolve({ tenant: 'test-tenant' }) }
const URL_BASE = 'http://localhost:3000/api/test-tenant/reservas'
const FROZEN_NOW = new Date('2026-10-07T15:00:00.000Z')
const TODAY = '2026-10-07'

const ADMIN_WA = '+5491155554444'
const SEDE_WA = '+5491199998888'

const BASE_BODY = {
  date: TODAY,
  time: '18:00',
  partySize: 2,
  name: 'Ana Test',
  phone: '+5491122334455',
}

// setup.ts deja una ENCRYPTION_KEY en hex, pero lib/crypto la lee en base64.
let locationId: string

function req(body: Record<string, unknown>): NextRequest {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

async function post(body: Record<string, unknown>) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FROZEN_NOW)
  try {
    return await reservasPost(req(body), params)
  } finally {
    vi.useRealTimers()
  }
}

function waTexts(): string[] {
  return vi.mocked(sendWhatsApp).mock.calls.map(c => String(c[1]))
}

async function createLocation(extra: Record<string, unknown> = {}) {
  const location = await Location.create({
    tenantId: (await Tenant.findOne({ slug: 'test-tenant' }))._id,
    name: 'Sede Central',
    slug: 'sede-central',
    address: 'Av. Siempreviva 742',
    isActive: true,
    timezone: 'America/Argentina/Buenos_Aires',
    reservationConfig: {
      enabled: true,
      minPayment: 0,
      timeSlots: ['18:00'],
      maxPartySize: 6,
      minAdvanceMinutes: 30,
      slotConfig: { enabled: false, operatingHours: [] },
    },
    ...extra,
  })
  locationId = String(location._id)
  return location
}

beforeEach(async () => {
  vi.clearAllMocks()
  process.env.ENCRYPTION_KEY = Buffer.alloc(32).toString('base64')
  vi.mocked(sendWhatsApp).mockResolvedValue(undefined)

  await Tenant.create({
    name: 'Test Tenant',
    slug: 'test-tenant',
    plan: 'full',
    features: { reservations: true },
    notifications: { whatsappPhone: ADMIN_WA, notifyOnReservation: true },
  })
  await createLocation()
})

describe('POST /reservas — WhatsApp admin de creación (con seña)', () => {
  it('envía el aviso con código, sede, teléfono y "Pendiente de seña", sin confirmar', async () => {
    await Location.updateOne(
      { _id: locationId },
      { $set: { 'reservationConfig.minPayment': 5000, 'reservationConfig.paymentsEnabled': true } }
    )

    const res = await post({ ...BASE_BODY, locationId, email: 'ana@test.com', notes: 'Celiaquía' })
    expect(res.status).toBe(201)

    const texts = waTexts()
    expect(texts).toHaveLength(1)
    expect(texts[0]).toContain('📅 *Nueva reserva en Test Tenant*')
    expect(texts[0]).toContain('👤 Ana Test — 📱 +5491122334455')
    expect(texts[0]).toContain('2026-10-07 18:00 hs · 👥 2 pers')
    expect(texts[0]).toContain('📍 Sede Central')
    expect(texts[0]).toContain('🔢 Código #R0001')
    expect(texts[0]).toContain('⏳ Pendiente de seña de $50')
    expect(texts[0]).toContain('📝 Celiaquía')

    expect(sendReservationConfirmation).not.toHaveBeenCalled()
    const saved = await Reservation.findOne({}).lean()
    expect(saved?.status).toBe('pending_payment')
    expect(saved?.notifications?.confirmationSent).toBeFalsy()
  })

  it('omite la línea de seña si paymentsEnabled está en false', async () => {
    await Location.updateOne(
      { _id: locationId },
      { $set: { 'reservationConfig.minPayment': 5000, 'reservationConfig.paymentsEnabled': false } }
    )

    const res = await post({ ...BASE_BODY, locationId })
    expect(res.status).toBe(201)
    // Sin seña efectiva → es gratis: se suprime el aviso de creación…
    expect(waTexts()).toHaveLength(0)
    // …y se confirma en el mismo request marcando el flag.
    expect(sendReservationConfirmation).toHaveBeenCalledTimes(1)
    const saved = await Reservation.findOne({}).lean()
    expect(saved?.notifications?.confirmationSent).toBe(true)
  })
})

describe('POST /reservas — reserva gratis', () => {
  it('suprime el aviso de creación, confirma en el mismo request y marca confirmationSent', async () => {
    const res = await post({ ...BASE_BODY, locationId })
    expect(res.status).toBe(201)

    // Sin aviso "Nueva reserva": la confirmación con info completa lo reemplaza.
    expect(waTexts()).toHaveLength(0)

    expect(sendReservationConfirmation).toHaveBeenCalledTimes(1)
    const call = vi.mocked(sendReservationConfirmation).mock.calls[0]
    expect(call[0]).toMatchObject({
      name: 'Ana Test',
      phone: '+5491122334455',
      status: 'confirmed',
      paymentAmountCents: 0,
    })
    // tenantId + locationId presentes para que el WhatsApp al admin funcione.
    expect(call[3]).toBeDefined()
    expect(call[4]).toBeDefined()

    const saved = await Reservation.findOne({}).lean()
    expect(saved?.status).toBe('pending_payment')
    expect(saved?.notifications?.confirmationSent).toBe(true)
  })
})

describe('POST /reservas — override de WhatsApp por sede', () => {
  // Con seña el aviso de creación está activo (sin seña se suprime por gratis).
  async function useSenia() {
    await Location.updateOne(
      { _id: locationId },
      { $set: { 'reservationConfig.minPayment': 5000, 'reservationConfig.paymentsEnabled': true } }
    )
  }

  it('usa el número de la sede si está configurado', async () => {
    await useSenia()
    await Location.updateOne(
      { _id: locationId },
      { $set: { 'settings.whatsappPhone': SEDE_WA } }
    )

    await post({ ...BASE_BODY, locationId })
    expect(vi.mocked(sendWhatsApp).mock.calls[0][0]).toBe(SEDE_WA)
  })

  it('no envía el aviso si la sede tiene notifyOnReservation en false', async () => {
    await useSenia()
    await Location.updateOne(
      { _id: locationId },
      { $set: { 'settings.notifyOnReservation': false } }
    )

    await post({ ...BASE_BODY, locationId })
    expect(sendWhatsApp).not.toHaveBeenCalled()
  })

  it('no envía el aviso si el tenant no tiene número configurado', async () => {
    await useSenia()
    await Tenant.updateOne({ slug: 'test-tenant' }, { $set: { 'notifications.whatsappPhone': null } })

    await post({ ...BASE_BODY, locationId })
    expect(sendWhatsApp).not.toHaveBeenCalled()
  })
})

describe('POST /reservas — modo espacios', () => {
  it('incluye el nombre del espacio en el aviso de creación', async () => {
    const spaceId = '64b0000000000000000000aa'
    await Location.updateOne(
      { _id: locationId },
      {
        $set: {
          'reservationConfig.minPayment': 5000,
          'reservationConfig.paymentsEnabled': true,
          spaces: [
            { _id: spaceId, name: 'Terraza', capacity: 10, enabled: true, blockedDates: [] },
          ],
        },
      }
    )

    const res = await post({ ...BASE_BODY, locationId, spaceId })
    expect(res.status).toBe(201)
    expect(waTexts()[0]).toContain('🪑 Terraza')
  })
})
