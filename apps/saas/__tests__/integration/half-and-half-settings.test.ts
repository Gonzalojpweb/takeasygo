// Configuración de mitad y mitad del comercio: regla + precio de media por pizza.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import { auth } from '@/lib/auth'
import { tenantHalfPricing } from '@/lib/menu/half-pricing'
import { PUT } from '@/app/api/[tenant]/settings/half-and-half/route'

const SLUG = 'pizzeria'
let tenant: any
let loc: any
const DIRECT = new mongoose.Types.ObjectId()
const NESTED = new mongoose.Types.ObjectId()

const put = (body: unknown) => PUT(new NextRequest(`http://localhost/api/${SLUG}/settings/half-and-half`, {
  method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}), { params: Promise.resolve({ tenant: SLUG }) })

async function halfPriceOf(id: mongoose.Types.ObjectId) {
  const menu = await Menu.findOne({ tenantId: tenant._id }).lean() as any
  const items = menu.categories.flatMap((c: any) => [...(c.items ?? []), ...(c.subcategories ?? []).flatMap((s: any) => s.items ?? [])])
  return items.find((i: any) => String(i._id) === String(id))?.halfPrice
}

beforeEach(async () => {
  tenant = await Tenant.create({ slug: SLUG, name: 'Pizzería', isActive: true, status: 'active', plan: 'full' })
  loc = await Location.create({ tenantId: tenant._id, slug: 'centro', name: 'Centro', address: 'X', isActive: true })
  await Menu.create({
    tenantId: tenant._id, locationId: loc._id, isActive: true,
    categories: [
      { name: 'Bebidas', items: [{ name: 'Agua', price: 100 }] }, // sin subcategorías
      {
        name: 'Pizzas',
        items: [{ _id: DIRECT, name: 'Muzzarella', price: 1000, variants: [{ name: 'Grande', price: 1000 }] }],
        subcategories: [{ name: 'Especiales', items: [{ _id: NESTED, name: 'Napo', price: 1200, variants: [{ name: 'Grande', price: 1200 }] }] }],
      },
    ],
  })
  vi.mocked(auth).mockResolvedValue({ user: { id: 'admin-1', role: 'admin', tenantId: String(tenant._id), assignedLocations: [] }, expires: '' } as any)
})

describe('mitad y mitad: configuración del comercio', () => {
  it('sin configurar es «la más cara»', async () => {
    expect(await tenantHalfPricing(tenant._id)).toBe('max')
  })

  it('guarda la regla y el precio de media (también en subcategorías); vacío lo borra', async () => {
    const res = await put({
      pricing: 'half_sum',
      halfPrices: [
        { locationId: String(loc._id), itemId: String(DIRECT), halfPrice: 550 },
        { locationId: String(loc._id), itemId: String(NESTED), halfPrice: 700 },
      ],
    })
    expect(res.status).toBe(200)
    expect((await res.json()).updatedItems).toBe(2)
    expect(await tenantHalfPricing(tenant._id)).toBe('half_sum')
    expect(await halfPriceOf(DIRECT)).toBe(550)
    expect(await halfPriceOf(NESTED)).toBe(700)

    await put({ pricing: 'average', halfPrices: [{ locationId: String(loc._id), itemId: String(DIRECT), halfPrice: null }] })
    expect(await tenantHalfPricing(tenant._id)).toBe('average')
    expect(await halfPriceOf(DIRECT)).toBeUndefined()
  })

  it('valida la regla y que el cajero no pueda cambiarla', async () => {
    expect((await put({ pricing: 'gratis' })).status).toBe(400)
    vi.mocked(auth).mockResolvedValue({ user: { id: 'caj-1', role: 'cashier', tenantId: String(tenant._id), assignedLocations: [] }, expires: '' } as any)
    expect((await put({ pricing: 'average' })).status).toBe(403)
  })
})
