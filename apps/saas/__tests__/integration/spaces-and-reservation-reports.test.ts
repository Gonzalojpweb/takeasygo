import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/reservationNotifications', () => ({ sendReservationConfirmation: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Table from '@/models/Table'
import Reservation from '@/models/Reservation'
import User from '@/models/User'
import AuditLog from '@/models/AuditLog'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import { clearFreshUserCache } from '@/lib/apiAuth'
import { encrypt } from '@/lib/crypto'
import { isSpacesMode, getActiveSpaces } from '@/lib/space-capacity'
import { customerKey, groupCustomers, summarize, parseReportFilters, whatsappNumber, type ReportRow } from '@/lib/reservations/report'

import { GET as posSectors, POST as posCreateSector } from '@/app/api/[tenant]/pos/sectors/route'
import { PATCH as posPatchSector, DELETE as posDeleteSector } from '@/app/api/[tenant]/pos/sectors/[id]/route'
import { PUT as posIntake } from '@/app/api/[tenant]/pos/reservations/intake/route'
import { GET as panelSpaces, POST as panelCreateSpace } from '@/app/api/[tenant]/locations/[locationId]/spaces/route'
import { PUT as putLocation } from '@/app/api/[tenant]/locations/[locationId]/route'
import { POST as reservasPost } from '@/app/api/[tenant]/reservas/route'
import { GET as exportContacts } from '@/app/api/[tenant]/reservas/contacts/export/route'
import { POST as optOut } from '@/app/api/[tenant]/reservas/contacts/opt-out/route'

/**
 * 14/11/2026 — Espacios de la sede (POS y panel, «acepta reservas», recepción
 * de reservas desde el POS) y reportes/contactos de reservas con permiso.
 */

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'salon-test'
const ORIGINAL_KEY = process.env.ENCRYPTION_KEY

let tenantId: string
let locationId: string
let otherLocationId: string
let adminId: string
let managerId: string

type Role = 'cashier' | 'manager' | 'admin' | 'waiter'

function posReq(path: string, method: string, body?: unknown, role: Role = 'manager'): NextRequest {
  const token = signJwt({ sub: role === 'admin' ? adminId : managerId, tenantId, role, deviceType: 'hub' }, PRIVATE_PEM)
  return new Request(`http://localhost:3000/api/${SLUG}/pos${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-location-id': locationId },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest
}
const p = (extra: Record<string, string> = {}) => ({ params: Promise.resolve({ tenant: SLUG, ...extra }) }) as never
const panelReq = (path: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost/api/${SLUG}/${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
const session = (role: string, id: string, assignedLocations: string[] = []) =>
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id, role, tenantId, tenantSlug: SLUG, assignedLocations }, expires: '' })
const json = async (res: Response) => (await res.json()) as Record<string, any>

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})
afterAll(() => { process.env.ENCRYPTION_KEY = ORIGINAL_KEY })

beforeEach(async () => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32).toString('base64')
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  clearFreshUserCache()
  tenantId = String((await Tenant.create({ name: 'Salón', slug: SLUG, plan: 'full', isActive: true, features: { posEnabled: true, reservations: true } }))._id)
  const loc = await Location.create({
    tenantId, name: 'Centro', slug: 'centro', address: 'Calle 1', isActive: true, timezone: 'America/Argentina/Buenos_Aires',
    reservationConfig: { enabled: true, minPayment: 0, paymentsEnabled: false, timeSlots: ['12:00', '20:00', '21:00'], maxPartySize: 10, minAdvanceMinutes: 0, slotConfig: { enabled: false, operatingHours: [] } },
    spaces: [{ name: 'Salón', capacity: 20, enabled: true, blockedDates: [], order: 0 }],
  })
  locationId = String(loc._id)
  otherLocationId = String((await Location.create({ tenantId, name: 'Norte', slug: 'norte', address: 'Calle 2', isActive: true }))._id)
  const mk = async (role: string, name: string) => String((await User.create({ name, email: `${name}-${Math.random().toString(36).slice(2)}@t.com`, password: 'x-secret-123', phone: `+54${Math.floor(Math.random() * 1e10)}`, role, tenantId, isActive: true }))._id)
  adminId = await mk('admin', 'dueno')
  managerId = await mk('manager', 'ana')
})

const spacesOf = async () => ((await Location.findById(locationId).lean<{ spaces: { _id: mongoose.Types.ObjectId; name: string; capacity: number; reservable?: boolean; blockedDates: string[] }[] }>())!.spaces)

describe('espacios desde el POS', () => {
  it('encargado crea un sector (sin reservas por defecto); el cajero no puede', async () => {
    expect((await posCreateSector(posReq('/sectors', 'POST', { name: 'Terraza' }, 'cashier'), p())).status).toBe(403)
    const res = await posCreateSector(posReq('/sectors', 'POST', { name: 'Terraza' }), p())
    expect(res.status).toBe(201)
    expect((await json(res)).sector).toMatchObject({ name: 'Terraza', reservable: false, capacity: 0 })
    const list = await json(await posSectors(posReq('/sectors', 'GET', undefined, 'cashier'), p()))
    expect(list.sectors.map((s: { name: string }) => s.name)).toEqual(['Salón', 'Terraza'])
    // El espacio que ya existía queda reservable (compatibilidad).
    expect(list.sectors[0].reservable).toBe(true)
    expect(list.reservations).toEqual({ available: true, enabled: true })
    expect(await AuditLog.countDocuments({ tenantId, action: 'location.space.create' })).toBe(1)
  })

  it('nombre repetido → 409; aceptar reservas sin capacidad → 400; con capacidad sí', async () => {
    expect((await posCreateSector(posReq('/sectors', 'POST', { name: 'salón' }), p())).status).toBe(409)
    const created = (await json(await posCreateSector(posReq('/sectors', 'POST', { name: 'Barra' }), p()))).sector
    expect((await posPatchSector(posReq(`/sectors/${created.id}`, 'PATCH', { reservable: true }), p({ id: created.id }))).status).toBe(400)
    expect((await posPatchSector(posReq(`/sectors/${created.id}`, 'PATCH', { reservable: true, capacity: 8 }), p({ id: created.id }))).status).toBe(200)
  })

  it('renombrar actualiza la sección de sus mesas; borrar con mesas o reservas por venir → 409', async () => {
    const [salon] = await spacesOf()
    await Table.create({ tenantId, locationId, posId: crypto.randomUUID(), number: 1, capacity: 4, spaceId: salon._id, section: 'Salón' })
    const id = String(salon._id)
    expect((await posPatchSector(posReq(`/sectors/${id}`, 'PATCH', { name: 'Interior' }), p({ id }))).status).toBe(200)
    expect((await Table.findOne({ tenantId, number: 1 }).lean<{ section: string }>())!.section).toBe('Interior')
    expect((await posDeleteSector(posReq(`/sectors/${id}`, 'DELETE'), p({ id }))).status).toBe(409)

    const terraza = (await json(await posCreateSector(posReq('/sectors', 'POST', { name: 'Terraza', reservable: true, capacity: 10 }), p()))).sector
    await Reservation.create({ tenantId, locationId, reservationNumber: 'R-1', date: '2099-01-01', time: '20:00', partySize: 2, name: encrypt('Luis'), phone: encrypt('1122334455'), status: 'confirmed', spaceId: terraza.id })
    expect((await posDeleteSector(posReq(`/sectors/${terraza.id}`, 'DELETE'), p({ id: terraza.id }))).status).toBe(409)
    const vacio = (await json(await posCreateSector(posReq('/sectors', 'POST', { name: 'Patio' }), p()))).sector
    expect((await posDeleteSector(posReq(`/sectors/${vacio.id}`, 'DELETE'), p({ id: vacio.id }))).status).toBe(200)
  })

  it('«Sin reservas hoy» bloquea la fecha del espacio', async () => {
    const [salon] = await spacesOf()
    const id = String(salon._id)
    expect((await posPatchSector(posReq(`/sectors/${id}`, 'PATCH', { blockedDates: ['2099-05-01'] }), p({ id }))).status).toBe(200)
    expect((await spacesOf())[0].blockedDates).toEqual(['2099-05-01'])
    expect((await posPatchSector(posReq(`/sectors/${id}`, 'PATCH', { blockedDates: ['nope'] }), p({ id }))).status).toBe(400)
  })

  it('pausar / abrir reservas de la sede: encargado sí, cajero no; sin módulo de reservas → 403', async () => {
    expect((await posIntake(posReq('/reservations/intake', 'PUT', { enabled: false }, 'cashier'), p())).status).toBe(403)
    const off = await posIntake(posReq('/reservations/intake', 'PUT', { enabled: false }), p())
    expect(await json(off)).toEqual({ enabled: false })
    expect((await Location.findById(locationId).lean<{ reservationConfig: { enabled: boolean } }>())!.reservationConfig.enabled).toBe(false)
    await Tenant.updateOne({ _id: tenantId }, { $set: { 'features.reservations': false } })
    expect((await posIntake(posReq('/reservations/intake', 'PUT', { enabled: true }), p())).status).toBe(403)
  })

  it('un comercio sin reservas también crea sectores', async () => {
    await Tenant.updateOne({ _id: tenantId }, { $set: { 'features.reservations': false } })
    expect((await posCreateSector(posReq('/sectors', 'POST', { name: 'Vereda' }), p())).status).toBe(201)
    expect((await json(await posSectors(posReq('/sectors', 'GET'), p()))).reservations).toEqual({ available: false, enabled: false })
  })
})

describe('espacios desde el panel', () => {
  it('encargado de la sede crea; de otra sede no; cajero no', async () => {
    session('manager', managerId)
    const ok = await panelCreateSpace(panelReq(`locations/${locationId}/spaces`, 'POST', { name: 'Terraza' }), p({ locationId }))
    expect(ok.status).toBe(201)
    // Los permisos se leen frescos de la base: la sede se asigna en el usuario.
    await User.updateOne({ _id: managerId }, { $set: { assignedLocations: [new mongoose.Types.ObjectId(otherLocationId)] } })
    clearFreshUserCache()
    session('manager', managerId, [otherLocationId])
    expect((await panelSpaces(panelReq(`locations/${locationId}/spaces`, 'GET'), p({ locationId }))).status).toBe(403)
    session('cashier', managerId)
    expect((await panelSpaces(panelReq(`locations/${locationId}/spaces`, 'GET'), p({ locationId }))).status).toBe(403)
  })

  it('guardar la configuración de sede con la lista completa no pisa «acepta reservas»', async () => {
    const [salon] = await spacesOf()
    await Location.updateOne({ _id: locationId, 'spaces._id': salon._id }, { $set: { 'spaces.$.reservable': false } })
    session('admin', adminId)
    const res = await putLocation(panelReq(`locations/${locationId}`, 'PUT', { spaces: [{ _id: String(salon._id), name: 'Salón', capacity: 20, enabled: true, blockedDates: [] }] }), p({ locationId }))
    expect(res.status).toBe(200)
    expect((await spacesOf())[0].reservable).toBe(false)
  })
})

describe('reservas con espacios que no aceptan reservas', () => {
  const book = (body: Record<string, unknown>) =>
    reservasPost(new Request(`http://localhost:3000/api/${SLUG}/reservas`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(body) }) as unknown as NextRequest, p())
  const base = { date: '2099-03-10', time: '20:00', partySize: 2, name: 'Ana Pérez', phone: '+5491122334455' }

  it('una «Barra» no reservable no se puede elegir; el Salón sí', async () => {
    const barra = (await json(await posCreateSector(posReq('/sectors', 'POST', { name: 'Barra' }), p()))).sector
    const [salon] = await spacesOf()
    const bad = await book({ ...base, locationId, spaceId: barra.id })
    expect(bad.status).toBe(400)
    const ok = await book({ ...base, locationId, spaceId: String(salon._id) })
    expect(ok.status).toBeLessThan(300)
  })

  it('permiso para promos: solo con `true` explícito', async () => {
    const [salon] = await spacesOf()
    await book({ ...base, locationId, spaceId: String(salon._id), marketingOptIn: true })
    await book({ ...base, time: '21:00', phone: '+5491199998888', locationId, spaceId: String(salon._id), marketingOptIn: 'yes' })
    const docs = await Reservation.find({ tenantId }).lean<{ marketingOptIn: boolean; marketingOptInAt: Date | null }[]>()
    expect(docs.filter((d) => d.marketingOptIn).length).toBe(1)
    expect(docs.find((d) => d.marketingOptIn)!.marketingOptInAt).toBeInstanceOf(Date)
  })

  it('isSpacesMode / getActiveSpaces ignoran los no reservables', () => {
    const spaces = [{ _id: 'a', name: 'Barra', capacity: 0, reservable: false }, { _id: 'b', name: 'Salón', capacity: 20 }]
    expect(isSpacesMode([spaces[0]])).toBe(false)
    expect(getActiveSpaces(spaces, '2099-01-01').map((s) => s.name)).toEqual(['Salón'])
  })
})

describe('contactos de reservas', () => {
  async function seed() {
    const mk = (phone: string, name: string, optIn: boolean, date: string, status = 'confirmed') =>
      Reservation.create({ tenantId, locationId, reservationNumber: `R-${Math.random().toString(36).slice(2, 8)}`, date, time: '20:00', partySize: 2, name: encrypt(name), phone: encrypt(phone), email: `${name.toLowerCase()}@x.com`, status, marketingOptIn: optIn })
    await mk('+54 9 11 2233-4455', 'Ana', true, '2099-01-01')
    await mk('1122334455', 'Ana', true, '2099-02-01', 'seated')
    await mk('1199998888', 'Luis', false, '2099-01-05')
  }

  it('exportar: solo admin y solo clientes con permiso, agrupados por teléfono', async () => {
    await seed()
    session('manager', managerId)
    expect((await exportContacts(panelReq('reservas/contacts/export', 'GET'), p())).status).toBe(403)
    session('admin', adminId)
    const res = await exportContacts(panelReq('reservas/contacts/export', 'GET'), p())
    expect(res.status).toBe(200)
    const csv = await res.text()
    expect(csv).toContain('Ana')
    expect(csv).not.toContain('Luis')
    expect(csv.split('\r\n').length).toBe(2)
    expect(await AuditLog.countDocuments({ tenantId, action: 'reservations.contacts.export' })).toBe(1)
  })

  it('dar de baja quita el permiso en todas sus reservas', async () => {
    await seed()
    session('manager', managerId)
    const res = await optOut(panelReq('reservas/contacts/opt-out', 'POST', { key: customerKey('1122334455', '') }), p())
    expect(await json(res)).toEqual({ updated: 2 })
    expect(await Reservation.countDocuments({ tenantId, marketingOptIn: true })).toBe(0)
    expect((await optOut(panelReq('reservas/contacts/opt-out', 'POST', { key: 'cualquier cosa' }), p())).status).toBe(400)
  })
})

describe('reporte (puro)', () => {
  const row = (over: Partial<ReportRow>): ReportRow => ({ id: Math.random().toString(), locationId: 'L', date: '2026-11-10', time: '20:30', partySize: 2, name: 'Ana', phone: '1122334455', email: '', status: 'confirmed', spaceId: null, optIn: false, depositCents: 0, createdAt: new Date('2026-11-08T15:00:00Z'), ...over })

  it('resumen: asistencia, cancelaciones, seña, anticipación, clientes', () => {
    const f = parseReportFilters({ preset: 'custom', from: '2026-11-01', to: '2026-11-14', basis: 'date' })
    const s = summarize([
      row({ status: 'seated', depositCents: 5000 }),
      row({ status: 'no_show', phone: '1199998888', optIn: true }),
      row({ status: 'cancelled' }),
      row({ status: 'seated', partySize: 4, date: '2026-11-12' }),
    ], f)
    expect(s).toMatchObject({ total: 4, guests: 10, showRate: 66.7, cancelRate: 25, depositCents: 5000, customers: 2, optInCustomers: 1 })
    expect(s.avgLeadDays).toBeGreaterThan(1)
    expect(s.byDay.find((d) => d.day === '2026-11-10')!.count).toBe(3)
    expect(s.byHour).toEqual([{ label: '20 h', count: 4 }])
  })

  it('clientes: la reserva más reciente manda el permiso; teléfonos con formato distinto se unen', () => {
    const c = groupCustomers([
      row({ phone: '+54 9 11 2233-4455', optIn: true, createdAt: new Date('2026-11-01') }),
      row({ phone: '1122334455', optIn: false, createdAt: new Date('2026-11-09'), status: 'no_show' }),
    ])
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ reservations: 2, noShows: 1, optIn: false })
  })

  it('número de WhatsApp: agrega 54 a un local de 10 dígitos', () => {
    expect(whatsappNumber('11 2233-4455')).toBe('541122334455')
    expect(whatsappNumber('+54 9 11 2233-4455')).toBe('5491122334455')
    expect(whatsappNumber('123')).toBeNull()
  })
})
