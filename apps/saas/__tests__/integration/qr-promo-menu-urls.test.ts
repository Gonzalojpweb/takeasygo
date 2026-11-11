// ============================================================================
// qr-promo-menu-urls.test.ts — la campaña QR aparece al entrar al menú
// ============================================================================
// 10/11/2026: desde las direcciones por nombre de sede (31/10) la campaña no
// aparecía: el banner exigía /<comercio>/menu/<sede> (no veía el link general
// /<comercio>/menu de un comercio con una sola sede) y el disparo automático
// solo reconocía un _id de 24 caracteres. Además, en campañas globales con
// sede, el filtro de sede pisaba el de comercios destino.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import QrPromo from '@/models/QrPromo'
import { qrPromoMenuPath } from '@/lib/menu/location-ref'
import { GET } from '@/app/api/[tenant]/qr-promo/route'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

let tenantId: mongoose.Types.ObjectId
let caballitoId: string

function get(slug: string, params: Record<string, string>) {
  const url = new URL(`http://localhost/api/${slug}/qr-promo`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return GET(new NextRequest(url), { params: Promise.resolve({ tenant: slug }) }).then((r) => r.json())
}

function promo(extra: Record<string, unknown> = {}) {
  return QrPromo.create({
    scope: 'tenant', tenantId, locationId: null, slug: 'qr', isEnabled: true, type: 'info',
    frequency: 'every_visit', title: 'Temporada de hallacas', sourceTriggers: ['qr'], ...extra,
  })
}

beforeEach(async () => {
  tenantId = (await Tenant.create({ slug: 'que-cachapa', name: 'Que Cachapa', isActive: true, status: 'active', plan: 'full' }))._id
  caballitoId = String((await Location.create({ tenantId, name: 'Caballito', slug: 'caballito', address: 'X', isActive: true }))._id)
})

describe('Páginas del menú donde se muestra', () => {
  it('link general, página de la sede y menú para llevar; no en salón ni checkout', () => {
    expect(qrPromoMenuPath('/que-cachapa/menu')).toEqual({ show: true, locationRef: '' })
    expect(qrPromoMenuPath('/que-cachapa/menu/caballito')).toEqual({ show: true, locationRef: 'caballito' })
    expect(qrPromoMenuPath('/que-cachapa/menu/caballito/takeaway')).toEqual({ show: true, locationRef: 'caballito' })
    expect(qrPromoMenuPath('/que-cachapa/menu/caballito/dine-in').show).toBe(false)
    expect(qrPromoMenuPath('/que-cachapa/menu/caballito/takeaway/checkout').show).toBe(false)
    expect(qrPromoMenuPath('/que-cachapa/tracking/123').show).toBe(false)
  })
})

describe('Resolución de la sede desde la dirección', () => {
  it('link general de un comercio con una sola sede: muestra la campaña y devuelve la sede', async () => {
    await promo()
    const data = await get('que-cachapa', { source: 'qr-auto', location: '' })
    expect(data.show).toBe(true)
    expect(data.promo.title).toBe('Temporada de hallacas')
    expect(data.locationId).toBe(caballitoId)
  })

  it('por nombre de sede y por el _id viejo', async () => {
    await promo()
    expect((await get('que-cachapa', { source: 'qr-auto', location: 'caballito' })).show).toBe(true)
    expect((await get('que-cachapa', { source: 'qr', location: caballitoId })).locationId).toBe(caballitoId)
  })

  it('con varias sedes, el link general (selector) espera a que elija la sede', async () => {
    await promo()
    await Location.create({ tenantId, name: 'Palermo', slug: 'palermo', address: 'Y', isActive: true })
    expect(await get('que-cachapa', { source: 'qr-auto', location: '' })).toEqual({ show: false, reason: 'pick_location' })
  })

  it('una sede de otro comercio o inexistente no muestra nada', async () => {
    await promo()
    const other = await Tenant.create({ slug: 'otro', name: 'Otro', isActive: true, status: 'active', plan: 'full' })
    await Location.create({ tenantId: other._id, name: 'Centro', slug: 'centro', address: 'Z', isActive: true })
    expect((await get('que-cachapa', { source: 'qr-auto', location: 'centro' })).show).toBe(false)
    expect((await get('que-cachapa', { source: 'qr-auto', location: 'no-existe' })).show).toBe(false)
    expect((await get('que-cachapa', { source: 'qr-auto', location: '../x' })).show).toBe(false)
  })

  it('una campaña de otra sede no aparece en esta', async () => {
    const palermo = await Location.create({ tenantId, name: 'Palermo', slug: 'palermo', address: 'Y', isActive: true })
    await promo({ locationId: palermo._id })
    expect((await get('que-cachapa', { source: 'qr-auto', location: 'caballito' })).show).toBe(false)
    expect((await get('que-cachapa', { source: 'qr-auto', location: 'palermo' })).show).toBe(true)
  })
})

describe('Campañas globales con filtro de sede', () => {
  it('una campaña global dirigida a otro comercio no aparece aunque haya sede', async () => {
    const other = await Tenant.create({ slug: 'otro', name: 'Otro', isActive: true, status: 'active', plan: 'full' })
    await QrPromo.create({
      scope: 'global', targetTenants: [other._id], locationId: null, slug: 'global-otro', isEnabled: true,
      type: 'info', frequency: 'every_visit', title: 'Solo para otro', sourceTriggers: [],
    })
    expect((await get('que-cachapa', { source: 'qr-auto', location: 'caballito' })).show).toBe(false)
    expect((await get('que-cachapa', { source: 'qr-auto', locationId: caballitoId })).show).toBe(false)
    expect((await get('otro',{ source: 'qr-auto', location: '' })).show).toBe(false) // otro no tiene sedes
  })
})
