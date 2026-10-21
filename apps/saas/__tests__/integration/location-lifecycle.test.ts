// ============================================================================
// location-lifecycle.test.ts — Alta clonada, baja controlada y media por sede
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/cloudinary', () => ({
  folderRoot: () => 'tgo',
  uploadBuffer: vi.fn().mockResolvedValue({ secure_url: 'https://cdn/x.jpg' }),
}))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import Order from '@/models/Order'
import Reservation from '@/models/Reservation'
import { POST as createLocation } from '@/app/api/[tenant]/locations/route'
import { DELETE as deleteLocation } from '@/app/api/[tenant]/locations/[locationId]/route'
import { POST as upload } from '@/app/api/[tenant]/upload/route'
import { uploadBuffer } from '@/lib/cloudinary'
import { auth } from '@/lib/auth'

const SLUG = 'chopis-test'
let tenant: any
let source: any

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({ slug: SLUG, name: 'Chopis', isActive: true, status: 'active', plan: 'full' })
  source = await Location.create({
    tenantId: tenant._id, slug: 'centro', name: 'Centro', address: 'Av 1', isActive: true,
    prefix: 'CEN', timezone: 'America/Argentina/Cordoba',
    settings: {
      orderModes: ['takeaway', 'delivery'],
      paymentSurcharges: { mercadopago: { feePercent: 7 } },
      delayAnnouncement: { active: true, minutes: 20 },
    },
    reservationConfig: { enabled: true, maxPartySize: 8 },
    printerAgent: { secretHash: 'hash-de-centro' },
  })
  await Menu.create({
    tenantId: tenant._id, locationId: source._id,
    categories: [{ name: 'Platos', items: [{ name: 'Milanesa', price: 5000, likesCount: 12 }] }],
  })
  setSessionUser({ id: 'a1', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [] })
})

function setSessionUser(user: Record<string, unknown>) {
  vi.mocked(auth).mockResolvedValue({ user, expires: '' } as any)
}
const params = { params: Promise.resolve({ tenant: SLUG }) }
const json = (path: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost/api/${SLUG}/${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

describe('alta de sede clonando otra', () => {
  it('copia la configuración operativa y no lo que identifica a la sede', async () => {
    const res = await createLocation(json('locations', 'POST', {
      name: 'Norte', slug: 'norte', address: 'Av 2', cloneFromLocationId: source._id.toString(),
    }), params)
    expect(res.status).toBe(201)
    const { location } = await res.json()
    const created = await Location.findById(location._id).lean() as any
    expect(created.name).toBe('Norte')
    expect(created.address).toBe('Av 2')
    expect(created.timezone).toBe('America/Argentina/Cordoba')
    expect(created.settings.orderModes).toEqual(['takeaway', 'delivery'])
    expect(created.settings.paymentSurcharges.mercadopago.feePercent).toBe(7)
    expect(created.reservationConfig.maxPartySize).toBe(8)
    expect(created.prefix ?? null).toBeNull()
    expect(created.printerAgent?.secretHash ?? null).toBeNull()
    expect(created.settings.delayAnnouncement?.active ?? false).toBe(false)
  })

  it('con cloneMenu copia el menú con ids nuevos y likes en cero', async () => {
    const res = await createLocation(json('locations', 'POST', {
      name: 'Sur', slug: 'sur', address: 'Av 3', cloneFromLocationId: source._id.toString(), cloneMenu: true,
    }), params)
    const body = await res.json()
    expect(body.menuCloned).toBe(true)
    const original = await Menu.findOne({ locationId: source._id }).lean() as any
    const copy = await Menu.findOne({ locationId: body.location._id }).lean() as any
    expect(copy.categories[0].items[0].name).toBe('Milanesa')
    expect(copy.categories[0].items[0].likesCount).toBe(0)
    expect(String(copy.categories[0]._id)).not.toBe(String(original.categories[0]._id))
  })

  it('sede de origen de otro tenant → 404', async () => {
    const other = await Tenant.create({ slug: 'otro', name: 'Otro', isActive: true })
    const foreign = await Location.create({ tenantId: other._id, slug: 'x', name: 'X', address: 'X', isActive: true })
    const res = await createLocation(json('locations', 'POST', {
      name: 'Oeste', slug: 'oeste', address: 'Av 4', cloneFromLocationId: foreign._id.toString(),
    }), params)
    expect(res.status).toBe(404)
  })

  it('solo un admin de tenant da de alta sedes', async () => {
    setSessionUser({ id: 'w1', role: 'waiter', tenantId: tenant._id.toString(), assignedLocations: [] })
    expect((await createLocation(json('locations', 'POST', { name: 'Y', slug: 'y', address: 'Y' }), params)).status).toBe(403)
    setSessionUser({ id: 'a2', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [source._id.toString()] })
    // Admin con sedes asignadas: 404 (mismo criterio anti-enumeración que el resto)
    expect((await createLocation(json('locations', 'POST', { name: 'Z', slug: 'z', address: 'Z' }), params)).status).toBe(404)
  })
})

describe('baja de sede', () => {
  const del = (id: string, qs = '') =>
    deleteLocation(json(`locations/${id}${qs}`, 'DELETE'), { params: Promise.resolve({ tenant: SLUG, locationId: id }) })

  it('con pedidos abiertos o reservas futuras pide confirmación (409) y no la desactiva', async () => {
    await Order.collection.insertOne({
      tenantId: tenant._id, locationId: source._id, orderNumber: 'A-1', status: 'preparing', deletedAt: null, createdAt: new Date(),
    })
    await Reservation.collection.insertOne({
      tenantId: tenant._id, locationId: source._id, reservationNumber: 'R-1', date: '2999-01-01', time: '21:00',
      partySize: 2, name: 'x', phone: 'x', status: 'confirmed',
    })
    const res = await del(source._id.toString())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.openOrders).toBe(1)
    expect(body.futureReservations).toBe(1)
    expect((await Location.findById(source._id).lean() as any).isActive).toBe(true)
  })

  it('con ?force=1 la desactiva y conserva el historial', async () => {
    await Order.collection.insertOne({
      tenantId: tenant._id, locationId: source._id, orderNumber: 'A-1', status: 'preparing', deletedAt: null, createdAt: new Date(),
    })
    const res = await del(source._id.toString(), '?force=1')
    expect(res.status).toBe(200)
    expect((await Location.findById(source._id).lean() as any).isActive).toBe(false)
    expect(await Order.countDocuments({ locationId: source._id })).toBe(1)
  })

  it('sin pendientes se desactiva directo', async () => {
    expect((await del(source._id.toString())).status).toBe(200)
  })

  it('un mozo no da de baja sedes', async () => {
    setSessionUser({ id: 'w1', role: 'waiter', tenantId: tenant._id.toString(), assignedLocations: [] })
    expect((await del(source._id.toString())).status).toBe(403)
  })
})

describe('media por sede', () => {
  function uploadReq(locationId?: string) {
    const fd = new FormData()
    fd.append('file', new File([new Uint8Array([1, 2, 3])], 'foto.jpg', { type: 'image/jpeg' }))
    if (locationId) fd.append('locationId', locationId)
    return new NextRequest(`http://localhost/api/${SLUG}/upload`, { method: 'POST', body: fd })
  }

  it('con locationId guarda en la carpeta de la sede', async () => {
    const res = await upload(uploadReq(source._id.toString()), params)
    expect(res.status).toBe(200)
    const opts = vi.mocked(uploadBuffer).mock.calls[0][2] as { folder: string }
    expect(opts.folder).toBe(`tgo/${SLUG}/sedes/${source._id}`)
  })

  it('sin locationId queda como media del negocio', async () => {
    await upload(uploadReq(), params)
    const opts = vi.mocked(uploadBuffer).mock.calls[0][2] as { folder: string }
    expect(opts.folder).toBe(`tgo/${SLUG}`)
  })

  it('usuario de otra sede no sube a esta → 404', async () => {
    const other = await Location.create({ tenantId: tenant._id, slug: 'otra', name: 'Otra', address: 'O', isActive: true })
    setSessionUser({ id: 'm1', role: 'manager', tenantId: tenant._id.toString(), assignedLocations: [other._id.toString()] })
    expect((await upload(uploadReq(source._id.toString()), params)).status).toBe(404)
  })
})
