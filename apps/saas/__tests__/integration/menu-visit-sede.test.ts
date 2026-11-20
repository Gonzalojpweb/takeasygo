// ============================================================================
// menu-visit-sede.test.ts — Visitas a la carta atribuidas a la sede
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import MenuVisit from '@/models/MenuVisit'
import { POST as logVisit } from '@/app/api/visits/log/route'

let tenant: any
let loc1: any
let loc2: any

beforeEach(async () => {
  tenant = await Tenant.create({ slug: 'visitas', name: 'Visitas', isActive: true })
  loc1 = await Location.create({ tenantId: tenant._id, slug: 'a', name: 'A', address: 'A', isActive: true })
  loc2 = await Location.create({ tenantId: tenant._id, slug: 'b', name: 'B', address: 'B', isActive: true })
})

function visit(locationPath: string, ip = '10.0.0.1', extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return logVisit(new NextRequest('http://localhost/api/visits/log', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...headers },
    body: JSON.stringify({ tenantSlug: 'visitas', locationPath, ...extra }),
  }))
}
const last = async () => (await MenuVisit.findOne({}).sort({ visitedAt: -1 }).lean()) as any

describe('MenuVisit con sede', () => {
  it('la sede sale del path de la carta', async () => {
    await visit(`/visitas/menu/${loc1._id}`)
    const v = await MenuVisit.findOne({}).lean() as any
    expect(String(v.locationId)).toBe(String(loc1._id))
  })

  it('la misma IP en dos sedes cuenta una visita por sede', async () => {
    await visit(`/visitas/menu/${loc1._id}`)
    await visit(`/visitas/menu/${loc2._id}`)
    expect(await MenuVisit.countDocuments({})).toBe(2)
  })

  it('un id de sede de otro tenant no se atribuye', async () => {
    const other = await Tenant.create({ slug: 'otro', name: 'Otro', isActive: true })
    const foreign = await Location.create({ tenantId: other._id, slug: 'x', name: 'X', address: 'X', isActive: true })
    await visit(`/visitas/menu/${foreign._id}`)
    const v = await MenuVisit.findOne({}).lean() as any
    expect(v.locationId).toBeNull()
  })

  // ── Corrección 20/11: direcciones con el nombre de la sede (desde el 31/10) ──
  it('la sede sale del slug de la dirección (y del resto del camino)', async () => {
    await visit('/visitas/menu/b/takeaway?mesa=4', '10.0.1.1')
    expect(String((await last()).locationId)).toBe(String(loc2._id))
  })

  it('el link general /{comercio}/menu con una sola sede activa es esa sede', async () => {
    await Location.updateOne({ _id: loc2._id }, { $set: { isActive: false } })
    await visit('/visitas/menu', '10.0.1.2')
    expect(String((await last()).locationId)).toBe(String(loc1._id))
  })

  it('el link general con varias sedes queda sin sede', async () => {
    await visit('/visitas/menu', '10.0.1.3')
    expect((await last()).locationId).toBeNull()
  })

  it('un slug de otro comercio no se atribuye', async () => {
    const other = await Tenant.create({ slug: 'otro2', name: 'Otro', isActive: true })
    await Location.create({ tenantId: other._id, slug: 'solo-de-otro', name: 'X', address: 'X', isActive: true })
    await visit('/visitas/menu/solo-de-otro', '10.0.1.4')
    expect((await last()).locationId).toBeNull()
  })

  it('el origen y la promo llegan en el cuerpo', async () => {
    await visit('/visitas/menu/a', '10.0.1.5', { source: 'tgo-customer', promo: 'verano' })
    const v = await last()
    expect(v.source).toBe('tgo-customer')
    expect(v.promo).toBe('verano')
  })

  it('un source con formato inválido se ignora sin perder la visita', async () => {
    const res = await visit('/visitas/menu/a', '10.0.1.6', { source: '<script>' })
    expect(res.status).toBe(200)
    expect((await last()).source).toBe('direct')
  })

  it('el referrer real define el origen; el header de la propia página no', async () => {
    await visit('/visitas/menu/a', '10.0.1.7', { referrer: 'https://l.instagram.com/?u=x' })
    expect((await last()).source).toBe('instagram')
    await visit('/visitas/menu/a', '10.0.1.8', {}, { referer: 'http://localhost/visitas/menu/a' })
    expect((await last()).source).toBe('direct')
  })

  it('se mantiene la deduplicación de 5 minutos', async () => {
    await visit('/visitas/menu/a', '10.0.1.9')
    await visit('/visitas/menu/a/takeaway', '10.0.1.9')
    expect(await MenuVisit.countDocuments({ locationId: loc1._id })).toBe(1)
  })
})
