import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/reservationNotifications', () => ({
  sendReservationConfirmation: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/reservation-slots', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/reservation-slots')>()
  return { ...actual, generateReservationSlots: vi.fn(actual.generateReservationSlots) }
})

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Reservation from '@/models/Reservation'
import { generateReservationSlots } from '@/lib/reservation-slots'
import type { NextRequest } from 'next/server'
import { POST as reservasPost } from '@/app/api/[tenant]/reservas/route'

/**
 * Fase A — validación de fecha/horario en POST /api/[tenant]/reservas.
 *
 * El server aceptaba cualquier string de fecha y de hora: "la reserva ya pasó"
 * sólo se chequeaba en el cliente. Acá se fija el reloj en
 * 2026-10-07 12:00 (America/Argentina/Buenos_Aires) sólo mientras corre el
 * POST, así los `create` del beforeEach usan el reloj real.
 */

const params = { params: Promise.resolve({ tenant: 'test-tenant' }) }
const URL_BASE = 'http://localhost:3000/api/test-tenant/reservas'
const FROZEN_NOW = new Date('2026-10-07T15:00:00.000Z')
const TODAY = '2026-10-07'
const YESTERDAY = '2026-10-06'
const TOMORROW = '2026-10-08'

const BASE_BODY = {
  date: TODAY,
  time: '18:00',
  partySize: 2,
  name: 'Ana Test',
  phone: '+5491122334455',
}

// setup.ts deja una ENCRYPTION_KEY en hex, pero lib/crypto la lee en base64 y
// aes-256-gcm necesita exactamente 32 bytes. Se setea acá porque el env se
// lee en cada encrypt(), no al importar el módulo.
const ORIGINAL_ENCRYPTION_KEY = process.env.ENCRYPTION_KEY

let locationId: string
let legacyLocationId: string
let unlimitedLocationId: string

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

beforeEach(async () => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32).toString('base64')

  const tenant = await Tenant.create({
    name: 'Test Tenant',
    slug: 'test-tenant',
    plan: 'full',
    features: { reservations: true },
  })

  // Sede actual: antelación y máximo de comensales explícitos.
  const location = await Location.create({
    tenantId: tenant._id,
    name: 'Sede Central',
    slug: 'sede-central',
    address: 'Av. Siempreviva 742',
    isActive: true,
    timezone: 'America/Argentina/Buenos_Aires',
    reservationConfig: {
      enabled: true,
      minPayment: 0,
      timeSlots: ['11:00', '12:00', '12:30', '18:00'],
      maxPartySize: 6,
      minAdvanceMinutes: 30,
      slotConfig: { enabled: false, operatingHours: [] },
    },
  })
  locationId = String(location._id)

  // Sede "vieja": se le borran los campos nuevos para simular un documento
  // creado antes de que existieran.
  const legacy = await Location.create({
    tenantId: tenant._id,
    name: 'Sede Vieja',
    slug: 'sede-vieja',
    address: 'Calle Vieja 123',
    isActive: true,
    timezone: 'America/Argentina/Buenos_Aires',
    reservationConfig: {
      enabled: true,
      minPayment: 0,
      timeSlots: ['12:15', '12:30'],
      maxPartySize: 10,
      slotConfig: { enabled: false, operatingHours: [] },
    },
  })
  await Location.updateOne(
    { _id: legacy._id },
    {
      $unset: {
        'reservationConfig.minAdvanceMinutes': '',
        'reservationConfig.maxPartySize': '',
      },
    }
  )
  legacyLocationId = String(legacy._id)

  // Sede con límite deshabilitado explícitamente (null, no ausente).
  const unlimited = await Location.create({
    tenantId: tenant._id,
    name: 'Sin Límite',
    slug: 'sin-limite',
    address: 'Av. Ilimitada 1',
    isActive: true,
    timezone: 'America/Argentina/Buenos_Aires',
    reservationConfig: {
      enabled: true,
      minPayment: 0,
      timeSlots: ['12:30', '18:00'],
      maxPartySize: null,
      minAdvanceMinutes: 30,
      slotConfig: { enabled: false, operatingHours: [] },
    },
  })
  unlimitedLocationId = String(unlimited._id)
})

afterEach(() => {
  vi.useRealTimers()
  if (ORIGINAL_ENCRYPTION_KEY === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY
})

describe('fechas y horarios transcurridos', () => {
  it('fecha de ayer → 400', async () => {
    const res = await post({ ...BASE_BODY, locationId, date: YESTERDAY })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/ya pasó/i)
  })

  it('hoy con una hora que ya pasó → 400', async () => {
    const res = await post({ ...BASE_BODY, locationId, time: '11:00' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/ya pasó/i)
  })

  it('hoy con la hora exacta de ahora → 400', async () => {
    const res = await post({ ...BASE_BODY, locationId, time: '12:00' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/ya pasó/i)
  })

  it('respetando la antelación mínima: 12:15 queda corto (30 min desde 12:00)', async () => {
    const res = await post({ ...BASE_BODY, locationId, date: TODAY, time: '12:15' })
    expect(res.status).toBe(400)
  })

  it('la antelación mínima es inclusiva: 12:30 sí se puede', async () => {
    const res = await post({ ...BASE_BODY, locationId, date: TODAY, time: '12:30' })
    expect(res.status).toBe(201)
    expect((await res.json()).reservation.reservationNumber).toMatch(/^R\d{4}$/)
  })

  it('una fecha futura no se corta', async () => {
    const res = await post({ ...BASE_BODY, locationId, date: TOMORROW, time: '11:00' })
    expect(res.status).toBe(201)
  })
})

describe('formato de fecha y hora', () => {
  it('fecha que no es de calendario real → 400', async () => {
    const res = await post({ ...BASE_BODY, locationId, date: '2026-02-31' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Fecha inválida/)
  })

  it('fecha mal formada → 400', async () => {
    const res = await post({ ...BASE_BODY, locationId, date: '2026-10-07T00:00:00' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Fecha inválida/)
  })

  it('hora mal formada → 400', async () => {
    const res = await post({ ...BASE_BODY, locationId, time: 'noon' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Horario inválido/)
  })

  it('hora fuera de rango → 400', async () => {
    const res = await post({ ...BASE_BODY, locationId, time: '25:00' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Horario inválido/)
  })
})

describe('disponibilidad en modo manual', () => {
  it('hora bien formada pero no figura en timeSlots → 409 con los disponibles', async () => {
    const res = await post({ ...BASE_BODY, locationId, time: '15:00' })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.availableSlots).toEqual(['12:30', '18:00'])
  })

  it('sede sin ningún horario configurado → 409 con mensaje propio', async () => {
    const tenant = (await Tenant.findOne({ slug: 'test-tenant' }))!
    const noSlots = await Location.create({
      tenantId: tenant._id,
      name: 'Sin Horarios',
      slug: 'sin-horarios',
      address: 'Sin número s/n',
      isActive: true,
      timezone: 'America/Argentina/Buenos_Aires',
      reservationConfig: { enabled: true, minPayment: 0, timeSlots: [] },
    })
    const res = await post({ ...BASE_BODY, locationId: String(noSlots._id) })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/no tiene horarios/)
  })
})

describe('límite de comensales', () => {
  it('superar maxPartySize → 400', async () => {
    const res = await post({ ...BASE_BODY, locationId, partySize: 12 })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/máximo 6 personas/)
  })

  it('exactamente maxPartySize → 201', async () => {
    const res = await post({ ...BASE_BODY, locationId, partySize: 6 })
    expect(res.status).toBe(201)
  })

  it('maxPartySize ausente en un documento viejo: aplica el default 10 sin tirar 500', async () => {
    const res = await post({ ...BASE_BODY, locationId: legacyLocationId, partySize: 12 })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/máximo 10 personas/)
  })

  it('maxPartySize null explícito → sin límite (201)', async () => {
    const res = await post({ ...BASE_BODY, locationId: unlimitedLocationId, partySize: 12 })
    expect(res.status).toBe(201)
  })
})

describe('documentos viejos sin minAdvanceMinutes', () => {
  it('usa el default de 30 minutos en vez de tratarlo como 0', async () => {
    // 12:15 está en los timeSlots de la sede vieja, pero queda corto
    // respecto de los 30 min de antelación. Si el default se leyera como 0
    // esto crearía la reserva.
    const res = await post({ ...BASE_BODY, locationId: legacyLocationId, time: '12:15' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/ya pasó/i)
  })

  it('el slot que sí cumple la antelación pasa', async () => {
    const res = await post({ ...BASE_BODY, locationId: legacyLocationId, time: '12:30' })
    expect(res.status).toBe(201)
  })
})

describe('gates previos que siguen intactos', () => {
  it('reservaciones deshabilitadas en la sede → 400', async () => {
    const tenant = (await Tenant.findOne({ slug: 'test-tenant' }))!
    const off = await Location.create({
      tenantId: tenant._id,
      name: 'Cerrada',
      slug: 'cerrada',
      address: 'Calle Cerrada 0',
      isActive: true,
      timezone: 'America/Argentina/Buenos_Aires',
      reservationConfig: { enabled: false, timeSlots: ['18:00'] },
    })
    const res = await post({ ...BASE_BODY, locationId: String(off._id) })
    expect(res.status).toBe(400)
  })

  it('tenant sin features.reservations → 403', async () => {
    await Tenant.findOneAndUpdate({ slug: 'test-tenant' }, { 'features.reservations': false })
    const res = await post({ ...BASE_BODY, locationId })
    expect(res.status).toBe(403)
  })
})

describe('aforo por espacios', () => {
  let seedCounter = 0

  async function createSpacesLocation(overrides: Record<string, unknown> = {}) {
    const tenant = (await Tenant.findOne({ slug: 'test-tenant' }))!
    const location = await Location.create({
      tenantId: tenant._id,
      name: 'Con Espacios',
      slug: 'con-espacios',
      address: 'Av. Espacios 100',
      isActive: true,
      timezone: 'America/Argentina/Buenos_Aires',
      reservationConfig: {
        enabled: true,
        minPayment: 0,
        timeSlots: ['13:00', '15:00'],
        maxPartySize: null,
        minAdvanceMinutes: 0,
        slotConfig: { enabled: false, operatingHours: [] },
      },
      spaces: [
        { name: 'Salón', capacity: 2, enabled: true, blockedDates: [], order: 0 },
        { name: 'Terraza', capacity: 10, enabled: true, blockedDates: [], order: 1 },
      ],
      ...overrides,
    })
    return String(location._id)
  }

  async function seedReservation(locationId: string, partySize: number, time = '13:00') {
    const tenant = (await Tenant.findOne({ slug: 'test-tenant' }))!
    seedCounter += 1
    return Reservation.create({
      tenantId: tenant._id,
      locationId,
      reservationNumber: `R9${String(seedCounter).padStart(3, '0')}`,
      date: TOMORROW,
      time,
      partySize,
      name: 'Seed Test',
      phone: '+5491100000001',
      status: 'confirmed',
    })
  }

  async function activeReservations(locationId: string) {
    return Reservation.find({
      locationId,
      date: TOMORROW,
      status: { $in: ['pending_payment', 'confirmed'] },
    }).lean()
  }

  it('con lugar disponible crea la reserva y queda sin espacio asignado', async () => {
    const spacesLocationId = await createSpacesLocation()
    const res = await post({ ...BASE_BODY, date: TOMORROW, locationId: spacesLocationId, time: '13:00', partySize: 4 })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.reservation.spaceId).toBeNull()
  })

  it('grupo mayor al espacio más grande → 400 sin crear la reserva', async () => {
    const spacesLocationId = await createSpacesLocation()
    const res = await post({ ...BASE_BODY, date: TOMORROW, locationId: spacesLocationId, time: '13:00', partySize: 11 })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no entra en ningún espacio/)
    expect(await Reservation.find({ locationId: spacesLocationId })).toHaveLength(0)
  })

  it('sin lugar para el grupo → 409 y no se crea la reserva', async () => {
    const spacesLocationId = await createSpacesLocation()
    await seedReservation(spacesLocationId, 8)
    const res = await post({ ...BASE_BODY, date: TOMORROW, locationId: spacesLocationId, time: '13:00', partySize: 6 })
    expect(res.status).toBe(409)
    expect(await activeReservations(spacesLocationId)).toHaveLength(1)
  })

  it('si la capacidad se excede entre el chequeo y el insert, revierte y contesta 409', async () => {
    const spacesLocationId = await createSpacesLocation()
    await seedReservation(spacesLocationId, 8)

    // El chequeo previo ve el lugar libre (simula la carrera); el recount real no.
    vi.mocked(generateReservationSlots).mockResolvedValueOnce({
      date: TOMORROW,
      dayOpen: true,
      slots: [{ time: '13:00', available: true, currentReservations: 0, maxReservations: 12 }],
    })

    const res = await post({ ...BASE_BODY, date: TOMORROW, locationId: spacesLocationId, time: '13:00', partySize: 6 })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/se llenó/)
    expect(await activeReservations(spacesLocationId)).toHaveLength(1)
  })

  it('sobreventa concurrente: dos POST simultáneos no superan la capacidad', async () => {
    const spacesLocationId = await createSpacesLocation()
    await seedReservation(spacesLocationId, 6)

    const body = { ...BASE_BODY, date: TOMORROW, locationId: spacesLocationId, time: '13:00', partySize: 6 }
    const [first, second] = await Promise.all([
      reservasPost(req(body), params),
      reservasPost(req(body), params),
    ])

    const created = [first.status, second.status].filter(s => s === 201)
    expect(created.length).toBeLessThanOrEqual(1)

    const occupied = (await activeReservations(spacesLocationId))
      .reduce((sum, r) => sum + (r.partySize || 0), 0)
    expect(occupied).toBeLessThanOrEqual(12)
  })

  it('un espacio deshabilitado no aporta capacidad', async () => {
    const spacesLocationId = await createSpacesLocation({
      spaces: [
        { name: 'Salón', capacity: 2, enabled: true, blockedDates: [], order: 0 },
        { name: 'Terraza', capacity: 10, enabled: false, blockedDates: [], order: 1 },
      ],
    })
    await seedReservation(spacesLocationId, 2)
    const res = await post({ ...BASE_BODY, date: TOMORROW, locationId: spacesLocationId, time: '13:00', partySize: 1 })
    expect(res.status).toBe(409)
  })

  it('espacios con la fecha bloqueada → sin capacidad ese día', async () => {
    const spacesLocationId = await createSpacesLocation({
      spaces: [
        { name: 'Salón', capacity: 2, enabled: true, blockedDates: [TOMORROW], order: 0 },
        { name: 'Terraza', capacity: 10, enabled: true, blockedDates: [TOMORROW], order: 1 },
      ],
    })
    const res = await post({ ...BASE_BODY, date: TOMORROW, locationId: spacesLocationId, time: '13:00', partySize: 2 })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no entra en ningún espacio/)
  })

  it('sede sin spaces sigue con maxReservationsPerSlot (compatibilidad)', async () => {
    const tenant = (await Tenant.findOne({ slug: 'test-tenant' }))!
    const classic = await Location.create({
      tenantId: tenant._id,
      name: 'Clásica',
      slug: 'clasica',
      address: 'Calle Clásica 1',
      isActive: true,
      timezone: 'America/Argentina/Buenos_Aires',
      reservationConfig: {
        enabled: true,
        minPayment: 0,
        timeSlots: [],
        maxPartySize: null,
        minAdvanceMinutes: 0,
        slotConfig: {
          enabled: true,
          operatingHours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: '13:00', close: '16:00' }],
          slotIntervalMinutes: 60,
          blockDurationMinutes: 90,
          maxReservationsPerSlot: 1,
        },
      },
    })
    const classicLocationId = String(classic._id)
    await seedReservation(classicLocationId, 8)

    const taken = await post({ ...BASE_BODY, date: TOMORROW, locationId: classicLocationId, time: '13:00', partySize: 2 })
    expect(taken.status).toBe(409)

    const free = await post({ ...BASE_BODY, date: TOMORROW, locationId: classicLocationId, time: '15:00', partySize: 2 })
    expect(free.status).toBe(201)
  })
})
