// ============================================================================
// pos-catalog-variant.test.ts — ventas del POS con productos del catálogo
// ============================================================================
// El POS elige la variante en el grupo «Variante» y la manda como modificador.
// El servidor guarda en la línea el producto y la variante del catálogo (id
// estable), sin cambiar la app del POS. Los platos quedan como siempre.
// ============================================================================

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'
import Menu from '@/models/Menu'
import CatalogProduct from '@/models/CatalogProduct'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import { syncCatalogToLocations } from '@/lib/catalog/service'
import type { NextRequest } from 'next/server'
import { POST } from '@/app/api/[tenant]/pos/orders/route'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'tecno-pos'
const URL_ = `http://localhost:3000/api/${SLUG}/pos/orders`
const DISH_ID = new mongoose.Types.ObjectId().toString()

let tenantId: string
let locationId: string

const token = () => signJwt({ sub: '64b0000000000000000000a1', tenantId, role: 'cashier', deviceType: 'hub' }, PRIVATE_PEM)
const post = (body: unknown) => POST(new Request(URL_, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token()}` },
  body: JSON.stringify(body),
}) as unknown as NextRequest, { params: Promise.resolve({ tenant: SLUG }) })

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  const tenant = await Tenant.create({ name: 'Tecno', slug: SLUG, plan: 'full', vertical: 'tecnologia' })
  tenantId = tenant._id.toString()
  const loc = await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'X', isActive: true })
  locationId = loc._id.toString()
  // Carta con un plato propio (no debe cambiar) + los productos del catálogo.
  await Menu.create({ tenantId, locationId, isActive: true, categories: [{ name: 'Otros', sortOrder: 0, items: [{ _id: DISH_ID, name: 'Café', price: 100000 }] }] })
  await CatalogProduct.create([
    { tenantId, name: 'Funda', category: 'Fundas', variants: [
      { code: 'FUN-NEG', barcode: '7790000000011', name: 'Negra', listPrice: 1500000 },
      { code: 'FUN-ROJ', name: 'Roja', listPrice: 1600000 },
    ] },
    { tenantId, name: 'Cargador 20W', category: 'Cargadores', variants: [{ code: 'CAR20', listPrice: 900000 }] },
  ])
  await syncCatalogToLocations(tenant._id)
})

async function itemIdOf(name: string): Promise<string> {
  const menu = await Menu.findOne({ tenantId, locationId }).lean() as any
  for (const c of menu.categories) for (const it of c.items) if (it.name === name) return String(it._id)
  throw new Error(`no está ${name}`)
}

describe('POS + catálogo comercial', () => {
  it('la variante elegida en el POS queda identificada en la línea; el plato no cambia', async () => {
    const funda = await itemIdOf('Funda')
    const cargador = await itemIdOf('Cargador 20W')
    const res = await post({
      id: crypto.randomUUID(),
      items: [
        { productId: funda, name: 'Funda', quantity: 2, unitPrice: 1500000, total: 3200000, modifiers: [{ name: 'Variante: Roja', price: 100000 }] },
        { productId: cargador, name: 'Cargador 20W', quantity: 1, unitPrice: 900000, total: 900000 },
        { productId: DISH_ID, name: 'Café', quantity: 1, unitPrice: 100000, total: 100000 },
      ],
    })
    expect(res.status).toBe(201)
    const order = await Order.findOne({ tenantId }).lean() as any
    const products = await CatalogProduct.find({ tenantId }).lean() as any[]
    const fundaDoc = products.find(p => p.name === 'Funda')
    const cargadorDoc = products.find(p => p.name === 'Cargador 20W')
    const roja = fundaDoc.variants.find((v: any) => v.code === 'FUN-ROJ')

    const [l1, l2, l3] = order.items
    expect(l1).toMatchObject({ catalogProductId: String(fundaDoc._id), catalogVariantId: String(roja._id), itemKind: 'product' })
    expect(l2).toMatchObject({ catalogProductId: String(cargadorDoc._id), catalogVariantId: String(cargadorDoc.variants[0]._id) })
    expect(l3.catalogProductId).toBeUndefined()
    expect(l3.catalogVariantId).toBeUndefined()
    expect(order.total).toBe(4200000)
  })
})
