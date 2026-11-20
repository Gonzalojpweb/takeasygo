import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import Promotion from '@/models/Promotion'
import Combo from '@/models/Combo'
import { GET as menuPromotions } from '@/app/api/[tenant]/menu/[locationId]/promotions/route'
import { GET as offerChannels } from '@/app/api/[tenant]/menu/[locationId]/offer-channels/route'

/**
 * 20/11/2026 — canal de las promos en el menú y la consulta del checkout.
 * Antes ?mode= se leía y se ignoraba: todas las promos salían en todos lados.
 */

const SLUG = 'promo-canales'
let tenantId: mongoose.Types.ObjectId
let locationId: string
let ids: Record<string, string>

beforeEach(async () => {
  const tenant = await Tenant.create({ slug: SLUG, name: 'Canales', isActive: true, status: 'active', plan: 'full' })
  tenantId = tenant._id
  const loc = await Location.create({ tenantId, slug: 'sede', name: 'Sede', address: 'x', isActive: true })
  locationId = String(loc._id)
  await Menu.create({ tenantId, locationId: loc._id, isActive: true, categories: [] })
  const base = { tenantId, scope: 'tenant', type: 'info', price: 0, currency: 'ARS', isActive: true }
  const [todos, delivery, salon, viejo] = await Promotion.create([
    { ...base, title: 'Todos', channels: [] },
    { ...base, title: 'Solo delivery', channels: ['delivery'] },
    { ...base, title: 'Solo salón', channels: ['dine-in'] },
    { ...base, title: 'Vieja takeaway', visibility: 'takeaway' },
  ])
  const combo = await Combo.create({ tenantId, locationId: loc._id, name: 'Combo retiro', isActive: true, visibility: 'takeaway', priceMode: 'fixed', fixedPrice: 1000, minItems: 1, maxItems: 1, itemPool: ['x'] })
  ids = { todos: String(todos._id), delivery: String(delivery._id), salon: String(salon._id), viejo: String(viejo._id), combo: String(combo._id) }
})

async function titles(mode?: string) {
  const url = `http://localhost/api/${SLUG}/menu/${locationId}/promotions${mode ? `?mode=${mode}` : ''}`
  const res = await menuPromotions(new NextRequest(url), { params: Promise.resolve({ tenant: SLUG, locationId }) })
  const body = await res.json()
  return (body.promotions as { title: string }[]).map((p) => p.title).sort()
}

describe('menú: promos por canal', () => {
  it('menú online: todas menos las de salón; la vieja «takeaway» queda en Todos', async () => {
    expect(await titles('takeaway')).toEqual(['Solo delivery', 'Todos', 'Vieja takeaway'])
  })
  it('QR de mesa: sin las de delivery', async () => {
    expect(await titles('dine-in')).toEqual(['Solo salón', 'Todos', 'Vieja takeaway'])
  })
  it('sin mode (panel / mapeo del POS): todas', async () => {
    expect(await titles()).toHaveLength(4)
  })
})

describe('checkout: offer-channels', () => {
  it('devuelve título y canales de las promos y combos del carrito', async () => {
    const url = `http://localhost/api/${SLUG}/menu/${locationId}/offer-channels?promotionIds=${ids.delivery},${ids.viejo},nope&comboIds=${ids.combo}`
    const res = await offerChannels(new NextRequest(url), { params: Promise.resolve({ tenant: SLUG, locationId }) })
    const body = await res.json()
    expect(body.promotions[ids.delivery]).toEqual({ title: 'Solo delivery', channels: ['delivery'] })
    expect(body.promotions[ids.viejo]).toEqual({ title: 'Vieja takeaway', channels: [] })
    expect(body.combos[ids.combo]).toEqual({ title: 'Combo retiro', channels: ['delivery', 'takeaway'] })
  })

  it('no expone ofertas de otro comercio', async () => {
    const other = await Tenant.create({ slug: 'otro', name: 'Otro', isActive: true, status: 'active', plan: 'full' })
    const foreign = await Promotion.create({ tenantId: other._id, scope: 'tenant', type: 'info', title: 'Ajena', price: 0, currency: 'ARS', channels: ['delivery'] })
    const url = `http://localhost/api/${SLUG}/menu/${locationId}/offer-channels?promotionIds=${foreign._id}`
    const res = await offerChannels(new NextRequest(url), { params: Promise.resolve({ tenant: SLUG, locationId }) })
    expect((await res.json()).promotions).toEqual({})
  })
})
