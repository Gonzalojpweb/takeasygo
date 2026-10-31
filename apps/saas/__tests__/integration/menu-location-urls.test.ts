// ============================================================================
// menu-location-urls.test.ts — direcciones del menú con el nombre de la sede
// ============================================================================
// 31/10/2026: /kekelarry/menu/palermo en vez de /kekelarry/menu/<_id>. Las
// direcciones viejas (QR impresos, links en redes) siguen funcionando: se
// redirigen al nombre conservando el resto del camino y la query.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { menuHref, parseLegacyMenuPath, locationRefFilter } from '@/lib/menu/location-ref'
import { resolveMenuLocation } from '@/lib/menu/resolve-location'
import { GET as MENU_LINK } from '@/app/api/menu-link/route'
import MenuIndexPage from '@/app/[tenant]/menu/page'
import LocationPicker from '@/components/menu/LocationPicker'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

let tenantId: mongoose.Types.ObjectId
let palermoId: string

async function locationFor(slug: string, name: string, isActive = true) {
  return Location.create({ tenantId, name, slug, address: 'Calle 1', isActive })
}

function link(params: Record<string, string>) {
  const url = new URL('http://localhost/api/menu-link')
  for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v)
  return MENU_LINK(new NextRequest(url))
}

beforeEach(async () => {
  tenantId = (await Tenant.create({ slug: 'kekelarry', name: 'Keke Larry', isActive: true, status: 'active', plan: 'full' }))._id
  palermoId = String((await locationFor('palermo', 'Palermo'))._id)
})

describe('Armado y lectura de direcciones', () => {
  it('menuHref usa el nombre de la sede (y el _id solo si no hay nombre)', () => {
    expect(menuHref('kekelarry', { slug: 'palermo', _id: palermoId })).toBe('/kekelarry/menu/palermo')
    expect(menuHref('kekelarry', { slug: 'palermo' }, 'takeaway/checkout')).toBe('/kekelarry/menu/palermo/takeaway/checkout')
    expect(menuHref('kekelarry', { _id: palermoId })).toBe(`/kekelarry/menu/${palermoId}`)
  })

  it('reconoce una dirección vieja con _id y no confunde una con nombre', () => {
    expect(parseLegacyMenuPath(`/kekelarry/menu/${palermoId}/dine-in`)).toEqual({ tenant: 'kekelarry', locationId: palermoId, rest: '/dine-in' })
    expect(parseLegacyMenuPath(`/kekelarry/menu/${palermoId}`)).toEqual({ tenant: 'kekelarry', locationId: palermoId, rest: '' })
    expect(parseLegacyMenuPath('/kekelarry/menu/palermo')).toBeNull()
    expect(parseLegacyMenuPath('/kekelarry/menu')).toBeNull()
    expect(locationRefFilter('palermo')).toEqual({ slug: 'palermo' })
    expect(locationRefFilter(palermoId)).toEqual({ _id: palermoId })
  })
})

describe('Compatibilidad: los QR y links viejos siguen funcionando', () => {
  it('un QR de mesa con _id llega al menú con el nombre, conservando la mesa y el origen', async () => {
    const res = await link({ t: 'kekelarry', l: palermoId, rest: '/dine-in', table: '5', source: 'qr' })
    expect(res.status).toBe(307)
    const to = new URL(res.headers.get('location')!)
    expect(to.pathname).toBe('/kekelarry/menu/palermo/dine-in')
    expect(to.searchParams.get('table')).toBe('5')
    expect(to.searchParams.get('source')).toBe('qr')
    expect(to.searchParams.has('t')).toBe(false)
    expect(to.searchParams.has('l')).toBe(false)
  })

  it('el link de una sesión grupal vieja conserva el token', async () => {
    const res = await link({ t: 'kekelarry', l: palermoId, rest: '/business/group/abc_123-XY' })
    expect(new URL(res.headers.get('location')!).pathname).toBe('/kekelarry/menu/palermo/business/group/abc_123-XY')
  })

  it('una sede dada de baja o de otro comercio manda al link general del comercio (nunca en bucle)', async () => {
    const closed = String((await locationFor('flores', 'Flores', false))._id)
    expect(new URL((await link({ t: 'kekelarry', l: closed })).headers.get('location')!).pathname).toBe('/kekelarry/menu')
    const otherTenant = await Tenant.create({ slug: 'otro', name: 'Otro', isActive: true, status: 'active', plan: 'full' })
    const foreign = String((await Location.create({ tenantId: otherTenant._id, name: 'Centro', slug: 'centro', address: 'X', isActive: true }))._id)
    expect(new URL((await link({ t: 'kekelarry', l: foreign })).headers.get('location')!).pathname).toBe('/kekelarry/menu')
  })

  it('datos inválidos no redirigen a ningún lado', async () => {
    expect((await link({ t: 'kekelarry', l: 'no-es-un-id' })).status).toBe(400)
    expect((await link({ t: 'kekelarry', l: palermoId, rest: '/../admin' })).status).toBe(400)
  })

  it('las pantallas aceptan el nombre y también el _id (por las dudas)', async () => {
    expect(await resolveMenuLocation('kekelarry', 'palermo')).toEqual({ locationId: palermoId, locationPath: 'palermo' })
    expect(await resolveMenuLocation('kekelarry', palermoId)).toEqual({ locationId: palermoId, locationPath: 'palermo' })
  })
})

describe('Link general del comercio', () => {
  it('con varias sedes muestra el selector y conserva la query del link (Instagram, QR general)', async () => {
    await locationFor('flores', 'Flores')
    const el = (await MenuIndexPage({
      params: Promise.resolve({ tenant: 'kekelarry' }),
      searchParams: Promise.resolve({ source: 'qr' }),
    })) as { type: unknown; props: { query: string; locations: { slug?: string }[] } }
    expect(el.type).toBe(LocationPicker)
    expect(el.props.query).toBe('source=qr')
    expect(el.props.locations.map((l) => l.slug)).toEqual(['palermo', 'flores'])
  })
})
