import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Table from '@/models/Table'
import Order from '@/models/Order'
import Menu from '@/models/Menu'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

import { POST as ordersPost, GET as ordersGet } from '@/app/api/[tenant]/pos/orders/route'
import { GET as orderGet, PATCH as orderPatch } from '@/app/api/[tenant]/pos/orders/[id]/route'
import { POST as itemPost } from '@/app/api/[tenant]/pos/orders/[id]/items/route'
import {
  PATCH as itemPatch,
  DELETE as itemDelete,
} from '@/app/api/[tenant]/pos/orders/[id]/items/[productId]/route'

/**
 * M4 — detalle de orden, transiciones de estado y edición de items.
 *
 * Espeja exactamente services/order.ts del POS: las mismas reglas de
 * transición (grafo compartido) y las mismas reglas de edición de items.
 */

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

const SLUG = 'test-tenant'
const URL_ = `http://localhost:3000/api/${SLUG}/pos/orders`
const PRODUCT_A = '64b0000000000000000000aa'
const PRODUCT_B = '64b0000000000000000000bb'

let tenantId: string
let locationId: string
let tablePosId: string

function token(): string {
  return signJwt(
    { sub: '64b0000000000000000000a1', tenantId, role: 'cashier', deviceType: 'hub' },
    PRIVATE_PEM
  )
}

const AUTH = () => ({ authorization: `Bearer ${token()}` })

function req(url: string, body?: unknown, headers: Record<string, string> = {}, method = 'POST'): NextRequest {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest
}

const listParams = { params: Promise.resolve({ tenant: SLUG }) }
const detailParams = (id: string) => ({ params: Promise.resolve({ tenant: SLUG, id }) })
const itemParams = (id: string, productId: string) => ({
  params: Promise.resolve({ tenant: SLUG, id, productId }),
})

function orderPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    items: [{ productId: PRODUCT_A, name: 'Hamburguesa', quantity: 2, unitPrice: 1500, total: 3000 }],
    ...overrides,
  }
}

/** Subconjunto del contrato POS que estos tests necesitan leer. */
interface CreatedOrder {
  id: string
  status: string
  total: number
  items: { quantity: number; total: number }[]
  notes?: string
}

async function createOrder(overrides: Record<string, unknown> = {}): Promise<CreatedOrder> {
  const res = await ordersPost(req(URL_, orderPayload(overrides), AUTH()), listParams)
  expect(res.status).toBe(201)
  const body = (await res.json()) as { order: CreatedOrder }
  return body.order
}

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)

  const tenant = await Tenant.create({ name: 'Test Tenant', slug: SLUG, plan: 'full' })
  tenantId = tenant._id.toString()

  const loc = await Location.create({
    tenantId,
    name: 'Local Centro',
    slug: 'centro',
    address: 'Av. Siempreviva 742',
    isActive: true,
  })
  locationId = loc._id.toString()

  const table = await Table.create({
    tenantId,
    locationId,
    posId: crypto.randomUUID(),
    number: 1,
    capacity: 4,
    status: 'free',
  })
  tablePosId = table.posId

  // Catálogo vigente con los precios que cierran con orderPayload() (S1-2).
  await Menu.create({
    tenantId,
    locationId,
    isActive: true,
    categories: [
      {
        name: 'Platos',
        sortOrder: 0,
        items: [
          { _id: PRODUCT_A, name: 'Hamburguesa', price: 1500 },
          { _id: PRODUCT_B, name: 'Papas', price: 500 },
        ],
      },
    ],
  })
})

describe('GET /pos/orders/[id]', () => {
  it('devuelve la orden por su posId', async () => {
    const created = await createOrder()
    const res = await orderGet(req(URL_ + '/' + created.id, undefined, AUTH(), 'GET'), detailParams(created.id))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.order.id).toBe(created.id)
    expect(body.order.total).toBe(3000)
  })

  it('sin token → 401', async () => {
    const created = await createOrder()
    const res = await orderGet(req(URL_ + '/' + created.id, undefined, {}, 'GET'), detailParams(created.id))
    expect(res.status).toBe(401)
  })

  it('orden inexistente → 404', async () => {
    const res = await orderGet(
      req(URL_ + '/nope', undefined, AUTH(), 'GET'),
      detailParams(crypto.randomUUID())
    )
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('not_found')
  })

  it('una orden de OTRA sede no existe para este token → 404', async () => {
    const foreign = await Location.create({
      tenantId,
      name: 'Otra',
      slug: 'otra',
      address: 'x',
      isActive: true,
    })
    const doc = await Order.create({
      tenantId,
      locationId: foreign._id,
      orderNumber: 'AAA-000000-0001',
      orderMode: 'takeaway',
      status: 'pending',
      source: 'pos',
      posId: crypto.randomUUID(),
      items: [],
      subtotal: 0,
      total: 0,
      customer: { name: 'X' },
      notes: '',
    })

    const res = await orderGet(
      req(`${URL_}/${doc.posId}`, undefined, { ...AUTH(), 'x-location-id': locationId }, 'GET'),
      detailParams(String(doc.posId))
    )
    expect(res.status).toBe(404)
  })
})

describe('PATCH /pos/orders/[id] — transiciones', () => {
  it('pending → confirmed y tumba confirmedAt', async () => {
    const created = await createOrder()
    const res = await orderPatch(
      req(`${URL_}/${created.id}`, { status: 'confirmed' }, AUTH()),
      detailParams(created.id)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.order.status).toBe('confirmed')

    const stored = await Order.findOne({ posId: created.id }).lean()
    expect(stored!.statusTimestamps.confirmedAt).toBeInstanceOf(Date)
  })

  it('un salto inválido → 409 transition_invalid con los destinos legales', async () => {
    const created = await createOrder()
    const res = await orderPatch(
      req(`${URL_}/${created.id}`, { status: 'ready' }, AUTH()),
      detailParams(created.id)
    )
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('transition_invalid')
    expect(body.error.detail).toContain('Allowed:')
    expect(await Order.findOne({ posId: created.id }).lean()).toMatchObject({ status: 'pending' })
  })

  it('confirmar dos veces → 409 (ya no es un estado de salida)', async () => {
    const created = await createOrder()
    await orderPatch(
      req(`${URL_}/${created.id}`, { status: 'confirmed' }, AUTH()),
      detailParams(created.id)
    )
    const res = await orderPatch(
      req(`${URL_}/${created.id}`, { status: 'confirmed' }, AUTH()),
      detailParams(created.id)
    )
    expect(res.status).toBe(409)
  })

  it('un estado desconocido → 400', async () => {
    const created = await createOrder()
    const res = await orderPatch(
      req(`${URL_}/${created.id}`, { status: 'volando' }, AUTH()),
      detailParams(created.id)
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('validation')
  })

  it('body sin status ni notes → 400', async () => {
    const created = await createOrder()
    const res = await orderPatch(
      req(`${URL_}/${created.id}`, { otraCosa: 1 }, AUTH()),
      detailParams(created.id)
    )
    expect(res.status).toBe(400)
  })

  it('actualiza las notas', async () => {
    const created = await createOrder()
    const res = await orderPatch(
      req(`${URL_}/${created.id}`, { notes: 'sin sal' }, AUTH()),
      detailParams(created.id)
    )
    expect(res.status).toBe(200)
    expect((await res.json()).order.notes).toBe('sin sal')
  })

  it('cancelar con mesa libera la mesa', async () => {
    await Table.updateOne(
      { posId: tablePosId },
      { $set: { status: 'occupied', currentOrderId: 'alguna-orden' } }
    )
    const created = await createOrder({ tableId: tablePosId })
    await Table.updateOne({ posId: tablePosId }, { $set: { currentOrderId: created.id } })

    const res = await orderPatch(
      req(`${URL_}/${created.id}`, { status: 'cancelled' }, AUTH()),
      detailParams(created.id)
    )
    expect(res.status).toBe(200)

    const table = await Table.findOne({ posId: tablePosId }).lean()
    expect(table!.status).toBe('free')
    expect(table!.currentOrderId).toBeNull()
  })
})

describe('items — agregar', () => {
  it('agrega un item y recalcula el total', async () => {
    const created = await createOrder()
    const res = await itemPost(
      req(`${URL_}/${created.id}/items`, {
        productId: PRODUCT_B,
        name: 'Papas',
        quantity: 3,
        unitPrice: 500,
        total: 1500,
      }, AUTH()),
      detailParams(created.id, PRODUCT_B)
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.order.items).toHaveLength(2)
    expect(body.order.total).toBe(4500)
  })

  it('un item con total que no cierra → 400', async () => {
    const created = await createOrder()
    const res = await itemPost(
      req(`${URL_}/${created.id}/items`, {
        productId: PRODUCT_B,
        name: 'Papas',
        quantity: 3,
        unitPrice: 500,
        total: 999,
      }, AUTH()),
      detailParams(created.id, PRODUCT_B)
    )
    expect(res.status).toBe(400)
    expect(await Order.findOne({ posId: created.id }).lean()).toMatchObject({ total: 3000 })
  })

  it('un item con precio fuera del catálogo → 409 y la orden no cambia', async () => {
    const created = await createOrder()
    const res = await itemPost(
      req(`${URL_}/${created.id}/items`, {
        productId: PRODUCT_B,
        name: 'Papas',
        quantity: 3,
        unitPrice: 400,
        total: 1200,
      }, AUTH()),
      detailParams(created.id, PRODUCT_B)
    )
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('conflict')
    expect(await Order.findOne({ posId: created.id }).lean()).toMatchObject({ total: 3000 })
  })

  it('en estado preparing no se puede editar → 409', async () => {
    const created = await createOrder()
    await orderPatch(
      req(`${URL_}/${created.id}`, { status: 'preparing' }, AUTH()),
      detailParams(created.id)
    )

    const res = await itemPost(
      req(`${URL_}/${created.id}/items`, {
        productId: PRODUCT_B,
        name: 'Papas',
        quantity: 1,
        unitPrice: 500,
        total: 500,
      }, AUTH()),
      detailParams(created.id, PRODUCT_B)
    )
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('conflict')
  })
})

describe('items — quitar y cantidades', () => {
  it('DELETE quita el producto y recalcula', async () => {
    const created = await createOrder({
      items: [
        { productId: PRODUCT_A, name: 'Hamburguesa', quantity: 2, unitPrice: 1500, total: 3000 },
        { productId: PRODUCT_B, name: 'Papas', quantity: 1, unitPrice: 500, total: 500 },
      ],
    })

    const res = await itemDelete(
      req(`${URL_}/${created.id}/items/${PRODUCT_B}`, undefined, AUTH(), 'DELETE'),
      itemParams(created.id, PRODUCT_B)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.order.items).toHaveLength(1)
    expect(body.order.total).toBe(3000)
  })

  it('DELETE de un producto que no está → 404', async () => {
    const created = await createOrder()
    const res = await itemDelete(
      req(`${URL_}/${created.id}/items/${PRODUCT_B}`, undefined, AUTH(), 'DELETE'),
      itemParams(created.id, PRODUCT_B)
    )
    expect(res.status).toBe(404)
  })

  it('PATCH cantidad recalcula el subtotal del item y el total', async () => {
    const created = await createOrder()
    const res = await itemPatch(
      req(`${URL_}/${created.id}/items/${PRODUCT_A}`, { quantity: 5 }, AUTH()),
      itemParams(created.id, PRODUCT_A)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.order.items[0].quantity).toBe(5)
    expect(body.order.items[0].total).toBe(7500)
    expect(body.order.total).toBe(7500)
  })

  it('PATCH cantidad 0 quita el item (espejo del POS)', async () => {
    const created = await createOrder()
    const res = await itemPatch(
      req(`${URL_}/${created.id}/items/${PRODUCT_A}`, { quantity: 0 }, AUTH()),
      itemParams(created.id, PRODUCT_A)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.order.items).toHaveLength(0)
    expect(body.order.total).toBe(0)
  })

  it('PATCH cantidad negativa o no entera → 400', async () => {
    const created = await createOrder()
    const res = await itemPatch(
      req(`${URL_}/${created.id}/items/${PRODUCT_A}`, { quantity: -1 }, AUTH()),
      itemParams(created.id, PRODUCT_A)
    )
    expect(res.status).toBe(400)

    const res2 = await itemPatch(
      req(`${URL_}/${created.id}/items/${PRODUCT_A}`, { quantity: 2.5 }, AUTH()),
      itemParams(created.id, PRODUCT_A)
    )
    expect(res2.status).toBe(400)
  })

  it('sin token → 401', async () => {
    const created = await createOrder()
    const res = await itemDelete(
      req(`${URL_}/${created.id}/items/${PRODUCT_A}`, undefined, {}, 'DELETE'),
      itemParams(created.id, PRODUCT_A)
    )
    expect(res.status).toBe(401)
  })
})

describe('GET /pos/orders — filtros de lista', () => {
  it('filtra por tableId', async () => {
    await createOrder({ tableId: tablePosId })
    await createOrder()

    const res = await ordersGet(
      req(`${URL_}?tableId=${tablePosId}`, undefined, AUTH(), 'GET'),
      listParams
    )
    expect((await res.json()).orders).toHaveLength(1)
  })

  it('nunca expone órdenes que no son del POS (read model propio)', async () => {
    await createOrder()
    await Order.create({
      tenantId,
      locationId,
      orderNumber: 'AAA-000000-0099',
      orderMode: 'takeaway',
      status: 'pending',
      source: 'consumer',
      items: [],
      subtotal: 0,
      total: 0,
      customer: { name: 'X' },
      notes: '',
    })

    const res = await ordersGet(req(URL_, undefined, AUTH(), 'GET'), listParams)
    const body = await res.json()
    expect(body.orders).toHaveLength(1)
    expect(body.orders.every((o: { source: string }) => o.source === 'pos')).toBe(true)
  })
})
