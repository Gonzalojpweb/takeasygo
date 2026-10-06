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

import { GET, POST } from '@/app/api/[tenant]/pos/orders/route'

/**
 * M4 — superficie POS: órdenes.
 *
 * Cubre el contrato §1.3: posId como Idempotency-Key, totales recalculados
 * por el server, aislamiento de sede y errores tipados (nunca un 500 con
 * stack de Mongoose).
 */

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

const SLUG = 'test-tenant'
const URL_ = `http://localhost:3000/api/${SLUG}/pos/orders`

let tenantId: string
let locationId: string
let tablePosId: string

function token(role: 'cashier' | 'admin' | 'superadmin', tid?: string): string {
  return signJwt(
    {
      sub: '64b0000000000000000000a1',
      tenantId: tid ?? tenantId,
      role,
      deviceType: 'hub',
    },
    PRIVATE_PEM
  )
}

function bearer(t: string | null): Record<string, string> {
  return t ? { authorization: `Bearer ${t}` } : {}
}

function req(
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
  method = 'POST'
): NextRequest {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest
}

const params = { params: Promise.resolve({ tenant: SLUG }) }

const PRODUCT_ID = '64b0000000000000000000aa'

/**
 * Menú mínimo cuyos precios cierran con orderPayload() (S1-2: el server
 * valida los importes contra el catálogo vigente; sin carta no hay orden).
 */
async function seedMenu(tenant: string, location: string): Promise<void> {
  await Menu.create({
    tenantId: tenant,
    locationId: location,
    isActive: true,
    categories: [
      {
        name: 'Platos',
        sortOrder: 0,
        items: [
          {
            _id: PRODUCT_ID,
            name: 'Hamburguesa',
            price: 1500,
            customizationGroups: [
              {
                name: 'Extras',
                options: [
                  { name: 'Papas', extraPrice: 200 },
                  { name: 'Queso', extraPrice: 150 },
                ],
              },
            ],
          },
        ],
      },
    ],
  })
}

function orderPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    items: [
      {
        productId: PRODUCT_ID,
        name: 'Hamburguesa',
        quantity: 2,
        unitPrice: 1500,
        total: 3000,
      },
    ],
    ...overrides,
  }
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

  // Un solo tenant con UNA sola sede: así los tests que no declaran sede se
  // resuelven solas. Los que necesitan multi-sede crean la segunda acá abajo.
  const table = await Table.create({
    tenantId,
    locationId,
    posId: crypto.randomUUID(),
    number: 1,
    capacity: 4,
    status: 'free',
  })
  tablePosId = table.posId

  await seedMenu(tenantId, locationId)
})

/** Crea una segunda sede (los tests multi-sede la necesitan). */
async function addSecondLocation(): Promise<string> {
  const other = await Location.create({
    tenantId,
    name: 'Local Norte',
    slug: `norte-${Math.random().toString(36).slice(2, 8)}`,
    address: 'Calle 2',
    isActive: true,
  })
  const otherId = other._id.toString()
  await seedMenu(tenantId, otherId)
  return otherId
}

describe('POST /pos/orders — contrato', () => {
  it('crea una orden con 201, id = posId y total recalculado', async () => {
    const payload = orderPayload()
    const res = await POST(req(URL_, payload, bearer(token('cashier'))), params)

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.order.id).toBe(payload.id)
    expect(body.order.total).toBe(3000)
    expect(body.order.source).toBe('pos')
    expect(body.order.tenantId).toBe(tenantId)
    expect(body.order.orderNumber ?? body.order.id).toBeTruthy()

    const stored = await Order.findOne({ tenantId, posId: payload.id }).lean()
    expect(stored).not.toBeNull()
    expect(stored!.total).toBe(3000)
    expect(String(stored!.locationId)).toBe(locationId)
    expect(stored!.source).toBe('pos')
  })

  it('sin token → 401', async () => {
    const res = await POST(req(URL_, orderPayload(), {}), params)
    expect(res.status).toBe(401)
  })

  it('token de OTRO tenant → 403', async () => {
    const otherTenant = await Tenant.create({ name: 'Otro', slug: 'otro', plan: 'full' })
    const res = await POST(
      req(URL_, orderPayload(), bearer(token('cashier', otherTenant._id.toString()))),
      params
    )
    expect(res.status).toBe(403)
  })

  it('un total que no cierra → 400 y NO persiste nada', async () => {
    const payload = orderPayload()
    payload.items[0].total = 1
    const res = await POST(req(URL_, payload, bearer(token('cashier'))), params)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('validation')
    expect(await Order.countDocuments({})).toBe(0)
  })

  it('body JSON roto → 400, nunca 500', async () => {
    const res = await POST(
      new Request(URL_, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...bearer(token('cashier')) },
        body: '{esto no es json',
      }) as unknown as NextRequest,
      params
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('validation')
  })

  it('body vacío → 400', async () => {
    const res = await POST(
      new Request(URL_, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...bearer(token('cashier')) },
      }) as unknown as NextRequest,
      params
    )
    expect(res.status).toBe(400)
  })

  it('items vacíos → 400', async () => {
    const res = await POST(
      req(URL_, orderPayload({ items: [] }), bearer(token('cashier'))),
      params
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('validation')
  })
})

describe('POST /pos/orders — idempotencia (posId = Idempotency-Key)', () => {
  it('el mismo posId con el MISMO payload devuelve 200 y no duplica', async () => {
    const payload = orderPayload()

    const first = await POST(req(URL_, payload, bearer(token('cashier'))), params)
    expect(first.status).toBe(201)

    const second = await POST(req(URL_, payload, bearer(token('cashier'))), params)
    expect(second.status).toBe(200)

    const a = await first.json()
    const b = await second.json()
    expect(b.order.id).toBe(a.order.id)
    expect(b.order.total).toBe(a.order.total)
    expect(await Order.countDocuments({ tenantId })).toBe(1)
  })

  it('el mismo posId con un payload DISTINTO → 409 idempotency_mismatch', async () => {
    const payload = orderPayload()
    await POST(req(URL_, payload, bearer(token('cashier'))), params)

    const modified = { ...payload, items: [{ ...payload.items[0], quantity: 5, total: 7500 }] }
    const res = await POST(req(URL_, modified, bearer(token('cashier'))), params)

    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('idempotency_mismatch')
    expect(await Order.countDocuments({ tenantId })).toBe(1)
  })

  it('Idempotency-Key del header distinto del body.id → 409', async () => {
    const res = await POST(
      req(URL_, orderPayload(), {
        ...bearer(token('cashier')),
        'idempotency-key': crypto.randomUUID(),
      }),
      params
    )
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('idempotency_mismatch')
    expect(await Order.countDocuments({})).toBe(0)
  })

  it('dos reintentos concurrentes con el mismo posId crean UNA orden', async () => {
    const payload = orderPayload()
    const [a, b] = await Promise.all([
      POST(req(URL_, payload, bearer(token('cashier'))), params),
      POST(req(URL_, payload, bearer(token('cashier'))), params),
    ])

    expect([200, 201]).toContain(a.status)
    expect([200, 201]).toContain(b.status)
    expect(await Order.countDocuments({ tenantId })).toBe(1)
  })
})

describe('POST /pos/orders — sede', () => {
  it('rechaza un tableId que no es de esta sede → 404', async () => {
    const second = await addSecondLocation()
    const foreignTable = await Table.create({
      tenantId,
      locationId: second,
      posId: crypto.randomUUID(),
      number: 9,
      capacity: 2,
      status: 'free',
    })
    const res = await POST(
      req(URL_, orderPayload({ tableId: foreignTable.posId }), {
        ...bearer(token('cashier')),
        'x-location-id': locationId,
      }),
      params
    )
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('not_found')
    expect(await Order.countDocuments({})).toBe(0)
  })

  it('acepta una mesa propia y marca dine-in', async () => {
    const res = await POST(
      req(URL_, orderPayload({ tableId: tablePosId }), bearer(token('cashier'))),
      params
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.order.tableId).toBe(tablePosId)
    expect(await Order.countDocuments({ orderMode: 'dine-in' })).toBe(1)
  })

  it('el header X-Location-Id fija la sede y la GET respeta ese alcance', async () => {
    const second = await addSecondLocation()

    const create = await POST(
      req(URL_, orderPayload(), { ...bearer(token('cashier')), 'x-location-id': locationId }),
      params
    )
    expect(create.status).toBe(201)

    const other = await POST(
      req(URL_, orderPayload(), { ...bearer(token('cashier')), 'x-location-id': second }),
      params
    )
    expect(other.status).toBe(201)

    const here = await GET(
      req(URL_, undefined, { ...bearer(token('cashier')), 'x-location-id': locationId }, 'GET'),
      params
    )
    const hereBody = await here.json()
    expect(hereBody.orders).toHaveLength(1)

    const there = await GET(
      req(URL_, undefined, { ...bearer(token('cashier')), 'x-location-id': second }, 'GET'),
      params
    )
    expect((await there.json()).orders).toHaveLength(1)
  })

  it('con dos sedes activas y sin declarar sede → 400 (no elige una al azar)', async () => {
    await addSecondLocation()
    const res = await POST(req(URL_, orderPayload(), bearer(token('cashier'))), params)
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('validation')
  })
})

describe('GET /pos/orders', () => {
  it('sin token → 401', async () => {
    const res = await GET(req(URL_, undefined, {}, 'GET'), params)
    expect(res.status).toBe(401)
  })

  it('lista solo las de su sede y su tenant', async () => {
    await POST(
      req(URL_, orderPayload(), { ...bearer(token('cashier')), 'x-location-id': locationId }),
      params
    )

    const res = await GET(
      req(URL_, undefined, { ...bearer(token('cashier')), 'x-location-id': locationId }, 'GET'),
      params
    )
    const body = await res.json()
    expect(body.orders).toHaveLength(1)
    expect(body.orders[0].source).toBe('pos')
    expect(body.serverTime).toBeTruthy()
  })

  it('updatedSince devuelve solo lo modificado después de esa marca', async () => {
    const create = await POST(
      req(URL_, orderPayload(), { ...bearer(token('cashier')), 'x-location-id': locationId }),
      params
    )
    expect(create.status).toBe(201)

    const mark = new Date(Date.now() + 1000).toISOString()

    const before = await GET(
      req(`${URL_}?updatedSince=${encodeURIComponent(mark)}`, undefined, {
        ...bearer(token('cashier')),
        'x-location-id': locationId,
      }, 'GET'),
      params
    )
    expect((await before.json()).orders).toHaveLength(0)

    const all = await GET(
      req(URL_, undefined, { ...bearer(token('cashier')), 'x-location-id': locationId }, 'GET'),
      params
    )
    expect((await all.json()).orders).toHaveLength(1)
  })

  it('updatedSince inválido → 400', async () => {
    const res = await GET(
      req(`${URL_}?updatedSince=ayer`, undefined, {
        ...bearer(token('cashier')),
        'x-location-id': locationId,
      }, 'GET'),
      params
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('validation')
  })

  it('status filtra por estado', async () => {
    await POST(
      req(URL_, orderPayload({ status: 'preparing' }), {
        ...bearer(token('cashier')),
        'x-location-id': locationId,
      }),
      params
    )

    const res = await GET(
      req(`${URL_}?status=pending`, undefined, {
        ...bearer(token('cashier')),
        'x-location-id': locationId,
      }, 'GET'),
      params
    )
    expect((await res.json()).orders).toHaveLength(0)
  })
})

describe('POST /pos/orders — precios contra el catálogo vigente (S1-2)', () => {
  it('unitPrice por debajo del catálogo → 409 conflict y NO persiste', async () => {
    const payload = orderPayload({
      items: [{ productId: PRODUCT_ID, name: 'Hamburguesa', quantity: 2, unitPrice: 100, total: 200 }],
    })
    const res = await POST(req(URL_, payload, bearer(token('cashier'))), params)

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('conflict')
    expect(body.error.detail).toContain('catalogPrice=1500')
    expect(await Order.countDocuments({})).toBe(0)
  })

  it('unitPrice por encima del catálogo → 409 (sobreprecio tambien se rechaza)', async () => {
    const payload = orderPayload({
      items: [{ productId: PRODUCT_ID, name: 'Hamburguesa', quantity: 2, unitPrice: 9999, total: 19998 }],
    })
    const res = await POST(req(URL_, payload, bearer(token('cashier'))), params)

    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('conflict')
    expect(await Order.countDocuments({})).toBe(0)
  })

  it('productId fuera del catálogo vigente → 409', async () => {
    const payload = orderPayload({
      items: [
        { productId: '64b0000000000000000000ff', name: 'Borrado', quantity: 1, unitPrice: 100, total: 100 },
      ],
    })
    const res = await POST(req(URL_, payload, bearer(token('cashier'))), params)

    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('conflict')
    expect(await Order.countDocuments({})).toBe(0)
  })

  it('modificador con precio alterado → 409 aunque el total cierre', async () => {
    const payload = orderPayload({
      items: [
        {
          productId: PRODUCT_ID,
          name: 'Hamburguesa',
          quantity: 2,
          unitPrice: 1500,
          modifiers: [{ name: 'Extras: Papas', price: 1 }],
          total: 3002,
        },
      ],
    })
    const res = await POST(req(URL_, payload, bearer(token('cashier'))), params)

    expect(res.status).toBe(409)
    expect((await res.json()).error.detail).toContain('price=1')
    expect(await Order.countDocuments({})).toBe(0)
  })

  it('modificador inexistente en la carta → 409', async () => {
    const payload = orderPayload({
      items: [
        {
          productId: PRODUCT_ID,
          name: 'Hamburguesa',
          quantity: 1,
          unitPrice: 1500,
          modifiers: [{ name: 'Extras: Tocineta', price: 300 }],
          total: 1800,
        },
      ],
    })
    const res = await POST(req(URL_, payload, bearer(token('cashier'))), params)

    expect(res.status).toBe(409)
    expect(await Order.countDocuments({})).toBe(0)
  })

  it('precio y modificador vigentes → 201 con los importes del catálogo', async () => {
    const payload = orderPayload({
      items: [
        {
          productId: PRODUCT_ID,
          name: 'Hamburguesa',
          quantity: 2,
          unitPrice: 1500,
          modifiers: [{ name: 'Extras: Papas', price: 200 }],
          total: 3400,
        },
      ],
    })
    const res = await POST(req(URL_, payload, bearer(token('cashier'))), params)

    expect(res.status).toBe(201)
    const stored = await Order.findOne({ tenantId, posId: payload.id }).lean()
    expect(stored!.items[0]).toMatchObject({ basePrice: 1500, extraPrice: 200, price: 1700, subtotal: 3400 })
    expect(stored!.total).toBe(3400)
  })

  it('replay de una orden ya aceptada tras cambiar la carta → sigue en 200', async () => {
    const payload = orderPayload()
    const first = await POST(req(URL_, payload, bearer(token('cashier'))), params)
    expect(first.status).toBe(201)

    await Menu.updateOne(
      { tenantId, locationId },
      { $set: { 'categories.0.items.0.price': 9999 } }
    )

    const second = await POST(req(URL_, payload, bearer(token('cashier'))), params)
    expect(second.status).toBe(200)
    expect(await Order.countDocuments({ tenantId })).toBe(1)
  })
})
