import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'
import Menu from '@/models/Menu'
import Printer from '@/models/Printer'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

import { POST as CREATE } from '@/app/api/[tenant]/pos/orders/route'
import { PATCH } from '@/app/api/[tenant]/pos/orders/[id]/route'
import { POST as PAY } from '@/app/api/[tenant]/pos/orders/[id]/payments/route'
import { POST as ADD_ITEM } from '@/app/api/[tenant]/pos/orders/[id]/items/route'

/**
 * Auditoría POS Online V1 — §5 (cobro) y §8 (comanda).
 *
 *  · POST /pos/orders/[id]/payments: el cobro queda en la orden con su
 *    desglose real, la suma cierra contra el total del server, es write-once
 *    e idempotente, Kripton se rechaza y la autoría sale del token.
 *  · Una orden cobrada no admite cambios de items.
 *  · Al pasar a `confirmed` (o nacer confirmada) se generan los printJobs que
 *    consume el printer-agent: antes las órdenes del POS nunca imprimían.
 *  · Una orden no puede NACER en un estado que saltee el grafo.
 */

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

const SLUG = 'pay-tenant'
const BASE = `http://localhost:3000/api/${SLUG}/pos/orders`
const USER_ID = '64b0000000000000000000a1'
const PRODUCT_ID = '64b0000000000000000000aa'

let tenantId: string
let locationId: string

function token(): string {
  return signJwt({ sub: USER_ID, tenantId, role: 'cashier', deviceType: 'hub' }, PRIVATE_PEM)
}

function req(url: string, body: unknown, method = 'POST'): NextRequest {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token()}` },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

const tenantParams = () => ({ params: Promise.resolve({ tenant: SLUG }) })
const orderParams = (id: string) => ({ params: Promise.resolve({ tenant: SLUG, id }) })

async function createOrder(overrides: Record<string, unknown> = {}): Promise<string> {
  const id = crypto.randomUUID()
  const res = await CREATE(
    req(BASE, {
      id,
      items: [{ productId: PRODUCT_ID, name: 'Hamburguesa', quantity: 2, unitPrice: 1500, total: 3000 }],
      ...overrides,
    }),
    tenantParams()
  )
  expect(res.status).toBe(201)
  return id
}

function pay(orderId: string, payments: unknown[]) {
  return PAY(req(`${BASE}/${orderId}/payments`, { payments }), orderParams(orderId))
}

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  const tenant = await Tenant.create({ name: 'Pay Tenant', slug: SLUG, plan: 'full' })
  tenantId = tenant._id.toString()
  const loc = await Location.create({
    tenantId,
    name: 'Local',
    slug: 'local',
    address: 'Calle 1',
    isActive: true,
  })
  locationId = loc._id.toString()
  await Menu.create({
    tenantId,
    locationId,
    isActive: true,
    categories: [
      {
        name: 'Platos',
        sortOrder: 0,
        items: [{ _id: PRODUCT_ID, name: 'Hamburguesa', price: 1500 }],
      },
    ],
  })
})

describe('POST /pos/orders/[id]/payments', () => {
  it('un método: la orden queda cobrada con su desglose y fee explícito 0', async () => {
    const id = await createOrder()
    const res = await pay(id, [{ id: crypto.randomUUID(), method: 'posnet_debit', amount: 3000, reference: 'CUP-123' }])

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.order.payments).toEqual([{ method: 'posnet_debit', amount: 3000, reference: 'CUP-123' }])
    expect(body.order.paymentSource).toBe('pos_charged')

    const stored = await Order.findOne({ tenantId, posId: id }).lean()
    expect(stored!.payment.status).toBe('approved')
    expect(stored!.payment.method).toBe('posnet_debit')
    expect(stored!.payment.platformFeeAmount).toBe(0)
    // La autoría sale del token, nunca del body.
    expect(stored!.posPayments![0].userId).toBe(USER_ID)
  })

  it('cobro partido con montos libres → payment.method = mixed', async () => {
    const id = await createOrder()
    const res = await pay(id, [
      { id: crypto.randomUUID(), method: 'cash', amount: 1000 },
      { id: crypto.randomUUID(), method: 'mercadopago', amount: 2000 },
    ])
    expect(res.status).toBe(201)
    const stored = await Order.findOne({ tenantId, posId: id }).lean()
    expect(stored!.payment.method).toBe('mixed')
    expect(stored!.posPayments).toHaveLength(2)
  })

  it('la suma tiene que cerrar contra el total del server', async () => {
    const id = await createOrder()
    const res = await pay(id, [{ id: crypto.randomUUID(), method: 'cash', amount: 2999 }])
    expect(res.status).toBe(400)
    const stored = await Order.findOne({ tenantId, posId: id }).lean()
    expect(stored!.posPayments ?? []).toHaveLength(0)
  })

  it('reintento idéntico → 200; cobro distinto sobre orden cobrada → 409', async () => {
    const id = await createOrder()
    const parts = [{ id: crypto.randomUUID(), method: 'cash', amount: 3000 }]
    expect((await pay(id, parts)).status).toBe(201)
    expect((await pay(id, parts)).status).toBe(200)

    const other = await pay(id, [{ id: crypto.randomUUID(), method: 'transfer', amount: 3000 }])
    expect(other.status).toBe(409)
    expect((await other.json()).error.code).toBe('idempotency_mismatch')
  })

  it('Kripton se rechaza (no integrado en el POS)', async () => {
    const id = await createOrder()
    const res = await pay(id, [{ id: crypto.randomUUID(), method: 'kripton', amount: 3000 }])
    expect(res.status).toBe(400)
  })

  it('montos no enteros, ids repetidos o vacío → 400', async () => {
    const id = await createOrder()
    const dup = crypto.randomUUID()
    expect((await pay(id, [{ id: dup, method: 'cash', amount: 1500.5 }])).status).toBe(400)
    expect(
      (await pay(id, [
        { id: dup, method: 'cash', amount: 1500 },
        { id: dup, method: 'cash', amount: 1500 },
      ])).status
    ).toBe(400)
    expect((await pay(id, [])).status).toBe(400)
  })

  it('orden cancelada → 409', async () => {
    const id = await createOrder()
    expect((await PATCH(req(`${BASE}/${id}`, { status: 'cancelled' }, 'PATCH'), orderParams(id))).status).toBe(200)
    expect((await pay(id, [{ id: crypto.randomUUID(), method: 'cash', amount: 3000 }])).status).toBe(409)
  })

  it('orden inexistente → 404', async () => {
    const res = await pay(crypto.randomUUID(), [{ id: crypto.randomUUID(), method: 'cash', amount: 3000 }])
    expect(res.status).toBe(404)
  })

  it('una orden cobrada no admite items nuevos', async () => {
    const id = await createOrder()
    await pay(id, [{ id: crypto.randomUUID(), method: 'cash', amount: 3000 }])
    const res = await ADD_ITEM(
      req(`${BASE}/${id}/items`, { productId: PRODUCT_ID, name: 'Hamburguesa', quantity: 1, unitPrice: 1500, total: 1500 }),
      orderParams(id)
    )
    expect(res.status).toBe(409)
  })
})

describe('Estado inicial de la orden', () => {
  it('no puede nacer delivered', async () => {
    const res = await CREATE(
      req(BASE, {
        id: crypto.randomUUID(),
        status: 'delivered',
        items: [{ productId: PRODUCT_ID, name: 'Hamburguesa', quantity: 1, unitPrice: 1500, total: 1500 }],
      }),
      tenantParams()
    )
    expect(res.status).toBe(400)
  })
})

describe('Comanda (printJobs) al confirmar', () => {
  beforeEach(async () => {
    await Printer.create({
      tenantId,
      locationId,
      uid: 'cocina-1',
      name: 'Cocina',
      ip: '192.168.0.50',
      roles: ['kitchen'],
    })
  })

  it('PATCH pending → confirmed genera printJobs para la impresora de la sede', async () => {
    const id = await createOrder()
    const res = await PATCH(req(`${BASE}/${id}`, { status: 'confirmed' }, 'PATCH'), orderParams(id))
    expect(res.status).toBe(200)

    const stored = await Order.findOne({ tenantId, posId: id }).lean()
    expect(stored!.printJobs?.length ?? 0).toBeGreaterThan(0)
    expect(stored!.printed).toBe(false)
  })

  it('una orden que nace confirmed también genera la comanda', async () => {
    const id = await createOrder({ status: 'confirmed' })
    const stored = await Order.findOne({ tenantId, posId: id }).lean()
    expect(stored!.printJobs?.length ?? 0).toBeGreaterThan(0)
  })

  it('pending sin confirmar no imprime', async () => {
    const id = await createOrder()
    const stored = await Order.findOne({ tenantId, posId: id }).lean()
    expect(stored!.printJobs?.length ?? 0).toBe(0)
  })
})

describe('Comanda por estación: cocina y barra (Fase B, 2026-10)', () => {
  const DRINK_ID = '64b0000000000000000000bb'

  beforeEach(async () => {
    await Menu.updateOne(
      { tenantId, locationId },
      { $push: { categories: { name: 'Bebidas', sortOrder: 1, printRole: 'bar', items: [{ _id: DRINK_ID, name: 'Limonada', price: 800 }] } } }
    )
    await Printer.create({ tenantId, locationId, uid: 'cocina-1', name: 'Cocina', ip: '192.168.0.50', roles: ['kitchen'] })
    await Printer.create({ tenantId, locationId, uid: 'barra-1', name: 'Barra', ip: '192.168.0.51', roles: ['bar'] })
  })

  it('cada ítem lleva su estación según la categoría y cada impresora recibe lo suyo', async () => {
    const id = await createOrder({
      status: 'confirmed',
      items: [
        { productId: PRODUCT_ID, name: 'Hamburguesa', quantity: 1, unitPrice: 1500, total: 1500 },
        { productId: DRINK_ID, name: 'Limonada', quantity: 2, unitPrice: 800, total: 1600 },
      ],
    })
    const stored = await Order.findOne({ tenantId, posId: id }).lean()
    expect(stored!.items.map((i) => [i.name, i.printRole])).toEqual([
      ['Hamburguesa', 'kitchen'],
      ['Limonada', 'bar'],
    ])
    const roles = (stored!.printJobs ?? []).map((j) => j.role).sort()
    expect(roles).toEqual(['bar', 'kitchen'])
  })

  it('un pedido solo de bebidas no imprime en cocina', async () => {
    const id = await createOrder({
      status: 'confirmed',
      items: [{ productId: DRINK_ID, name: 'Limonada', quantity: 1, unitPrice: 800, total: 800 }],
    })
    const stored = await Order.findOne({ tenantId, posId: id }).lean()
    expect((stored!.printJobs ?? []).map((j) => j.role)).toEqual(['bar'])
  })
})
