import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import { auth } from '@/lib/auth'
import { clearFreshUserCache } from '@/lib/apiAuth'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import { GET as locationsGet } from '@/app/api/[tenant]/locations/route'
import { GET as locationGet } from '@/app/api/[tenant]/locations/[locationId]/route'
import { GET as notificationsGet } from '@/app/api/[tenant]/settings/notifications/route'
import { GET as personsGet } from '@/app/api/[tenant]/delivery/persons/route'

/**
 * S7/S8 (31/10/2026).
 * S7: los GET públicos de sedes devuelven solo lo que usa el menú.
 * S8: notificaciones y repartidores exigen sesión del comercio y rol admin/manager.
 */

const SLUG = 's7s8'
const SECRET = 'SECRETO-S7'
let tenantId: string
const locationId = new mongoose.Types.ObjectId()

const req = (path: string) => new NextRequest(`http://localhost/api/${SLUG}/${path}`)
const p = (extra: Record<string, string> = {}) => ({ params: Promise.resolve({ tenant: SLUG, ...extra }) })

function as(role: string | null, tid?: string) {
  clearFreshUserCache()
  vi.mocked(auth).mockResolvedValue(
    role ? ({ user: { id: 'u1', role, tenantId: tid ?? tenantId, tenantSlug: SLUG, assignedLocations: [] }, expires: '' } as any) : (null as any)
  )
}

beforeEach(async () => {
  await mongoose.connection.dropDatabase()
  const tenant = await Tenant.create({
    name: 'S7S8', slug: SLUG, plan: 'full', isActive: true,
    notifications: { whatsappPhone: SECRET, notifyOnOrder: true, notifyOnReservation: true },
  })
  tenantId = String(tenant._id)
  await mongoose.connection.db!.collection('locations').insertOne({
    _id: locationId, tenantId: tenant._id, name: 'Sede Centro', slug: 'centro', address: 'Calle 1',
    isActive: true, status: 'active', timezone: 'America/Argentina/Buenos_Aires', prefix: 'CEN',
    geo: { type: 'Point', coordinates: [-58.4, -34.6] },
    serviceHours: { takeaway: [{ days: [1], open: '10:00', close: '20:00' }] },
    scheduledOrdersConfig: { enabled: true, maxAdvanceHours: 24 },
    deliveryConfig: { enabled: true, ranges: [{ fromKm: 0, toKm: 3, price: 99999 }], maxRangeKm: 3 },
    settings: {
      acceptsOrders: true, orderModes: ['takeaway'], estimatedPickupTime: 25, delayAnnouncement: { active: false },
      whatsappPhone: SECRET, mpAccountId: SECRET, transferAccountId: SECRET, cash: { enabled: true },
      paymentSurcharges: { card: 5 }, notifyOnOrder: true,
    },
    rapiboyConfig: { enabled: true, apiToken: SECRET, webhookSecret: SECRET, margen: 7 },
    agentTokenHash: SECRET,
  })
  vi.mocked(auth).mockReset()
})

describe('S7: GET públicos de sedes', () => {
  const MENU_FIELDS = ['_id', 'name', 'slug', 'address', 'timezone', 'serviceHours', 'deliveryConfig', 'settings']

  it('listado: sin sesión, solo campos del menú', async () => {
    as(null)
    const res = await locationsGet(req('locations'), p())
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain(SECRET)
    const [loc] = JSON.parse(text).locations
    for (const f of [...MENU_FIELDS, 'geo']) expect(loc).toHaveProperty(f)
    expect(Object.keys(loc.settings).sort()).toEqual(['acceptsOrders', 'delayAnnouncement', 'estimatedPickupTime', 'orderModes'])
    expect(loc.deliveryConfig).toEqual({ enabled: true })
    for (const f of ['rapiboyConfig', 'prefix', 'agentTokenHash', 'tenantId']) expect(loc).not.toHaveProperty(f)
  })

  it('detalle: sin sesión, solo lo que usa el checkout', async () => {
    as(null)
    const res = await locationGet(req(`locations/${locationId}`), p({ locationId: String(locationId) }))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain(SECRET)
    const { location, effectiveEstimatedTime, tenantName } = JSON.parse(text)
    for (const f of [...MENU_FIELDS, 'scheduledOrdersConfig']) expect(location).toHaveProperty(f)
    expect(Object.keys(location.settings).sort()).toEqual(['acceptsOrders', 'delayAnnouncement', 'estimatedPickupTime', 'orderModes'])
    expect(location.deliveryConfig).toEqual({ enabled: true })
    expect(location).not.toHaveProperty('prefix')
    expect(effectiveEstimatedTime).toBe(25)
    expect(tenantName).toBe('S7S8')
  })
})

describe('S8: GET de notificaciones y repartidores', () => {
  const ROUTES = [
    { name: 'settings/notifications', call: () => notificationsGet(req('settings/notifications'), p()) },
    { name: 'delivery/persons', call: () => personsGet(req('delivery/persons'), p()) },
  ]

  it.each(ROUTES)('$name → 401 sin sesión', async ({ call }) => {
    as(null)
    expect((await call()).status).toBe(401)
  })

  it.each(ROUTES)('$name → 403 con admin de otro comercio', async ({ call }) => {
    as('admin', String(new mongoose.Types.ObjectId()))
    expect((await call()).status).toBe(403)
  })

  it.each(ROUTES)('$name → 403 con cajero del comercio', async ({ call }) => {
    as('cashier')
    expect((await call()).status).toBe(403)
  })

  it.each(ROUTES)('$name → 200 con manager del comercio', async ({ call }) => {
    as('manager')
    expect((await call()).status).toBe(200)
  })

  it('notificaciones: el admin del comercio las sigue viendo', async () => {
    as('admin')
    const res = await notificationsGet(req('settings/notifications'), p())
    expect(res.status).toBe(200)
    expect((await res.json()).notifications.whatsappPhone).toBe(SECRET)
  })
})
