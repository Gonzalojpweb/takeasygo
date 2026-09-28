import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Table from '@/models/Table'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

import { POST as ordersPost } from '@/app/api/[tenant]/pos/orders/route'
import { PATCH as orderPatch } from '@/app/api/[tenant]/pos/orders/[id]/route'
import { GET as tablesGet, POST as tablesPost } from '@/app/api/[tenant]/pos/tables/route'
import { PATCH as tablePatch } from '@/app/api/[tenant]/pos/tables/[id]/route'

/**
 * M4 — superficie POS: mesas.
 *
 * El server es la fuente de verdad: valida el MISMO grafo de transiciones que
 * el POS (assertTableTransition de @takeasygo/business) y no permite liberar
 * una mesa con una orden todavía en curso.
 */

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

const SLUG = 'test-tenant'
const TABLES_URL = `http://localhost:3000/api/${SLUG}/pos/tables`
const ORDERS_URL = `http://localhost:3000/api/${SLUG}/pos/orders`
const PRODUCT_ID = '64b0000000000000000000aa'

let tenantId: string
let locationId: string

function token(): string {
  return signJwt(
    { sub: '64b0000000000000000000a1', tenantId, role: 'cashier', deviceType: 'hub' },
    PRIVATE_PEM
  )
}

// Siempre declara la sede: varios tests crean una segunda Location y el
// server no debe elegir una sede por su cuenta (ver pos-context.test.ts).
const AUTH = () => ({ authorization: `Bearer ${token()}`, 'x-location-id': locationId })

function req(url: string, body?: unknown, headers: Record<string, string> = {}, method = 'POST'): NextRequest {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest
}

const listParams = { params: Promise.resolve({ tenant: SLUG }) }
const detailParams = (id: string) => ({ params: Promise.resolve({ tenant: SLUG, id }) })

async function createTable(overrides: Record<string, unknown> = {}): Promise<string> {
  const payload = { id: crypto.randomUUID(), number: 1, capacity: 4, ...overrides }
  const res = await tablesPost(req(TABLES_URL, payload, AUTH()), listParams)
  expect(res.status).toBe(201)
  const body = (await res.json()) as { table: { id: string } }
  return body.table.id
}

async function createOrder(): Promise<string> {
  const res = await ordersPost(
    req(ORDERS_URL, {
      id: crypto.randomUUID(),
      items: [{ productId: PRODUCT_ID, name: 'Hamburguesa', quantity: 1, unitPrice: 1500, total: 1500 }],
    }, AUTH()),
    { params: Promise.resolve({ tenant: SLUG }) }
  )
  expect(res.status).toBe(201)
  const body = (await res.json()) as { order: { id: string } }
  return body.order.id
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
})

describe('GET /pos/tables', () => {
  it('sin token → 401', async () => {
    const res = await tablesGet(req(TABLES_URL, undefined, {}, 'GET'), listParams)
    expect(res.status).toBe(401)
  })

  it('lista con id = posId, ordenadas por número', async () => {
    await createTable({ number: 3, capacity: 2 })
    await createTable({ number: 1, capacity: 4, section: 'Salón' })

    const res = await tablesGet(req(TABLES_URL, undefined, AUTH(), 'GET'), listParams)
    const body = await res.json()
    expect(body.tables.map((t: { number: number }) => t.number)).toEqual([1, 3])
    expect(body.tables[0].id).toBeTruthy()
    expect(body.tables[0].tenantId).toBe(tenantId)
    expect(body.tables[0].status).toBe('free')
    expect(body.serverTime).toBeTruthy()
  })

  it('filtra por status y por sección', async () => {
    const a = await createTable({ number: 1, section: 'Salón' })
    await createTable({ number: 2, section: 'Terraza' })
    await tablePatch(
      req(`${TABLES_URL}/${a}`, { status: 'occupied' }, AUTH()),
      detailParams(a)
    )

    const byStatus = await tablesGet(req(`${TABLES_URL}?status=occupied`, undefined, AUTH(), 'GET'), listParams)
    expect((await byStatus.json()).tables).toHaveLength(1)

    const bySection = await tablesGet(req(`${TABLES_URL}?section=Terraza`, undefined, AUTH(), 'GET'), listParams)
    expect((await bySection.json()).tables).toHaveLength(1)

    const bad = await tablesGet(req(`${TABLES_URL}?status=volando`, undefined, AUTH(), 'GET'), listParams)
    expect(bad.status).toBe(400)
  })

  it('no expone mesas de otra sede', async () => {
    const other = await Location.create({
      tenantId,
      name: 'Otra',
      slug: 'otra',
      address: 'x',
      isActive: true,
    })
    await Table.create({
      tenantId,
      locationId: other._id,
      posId: crypto.randomUUID(),
      number: 99,
      capacity: 2,
      status: 'free',
    })

    const res = await tablesGet(req(TABLES_URL, undefined, AUTH(), 'GET'), listParams)
    expect((await res.json()).tables).toHaveLength(0)
  })
})

describe('POST /pos/tables', () => {
  it('crea una mesa libre con 201', async () => {
    const res = await tablesPost(
      req(TABLES_URL, { id: crypto.randomUUID(), number: 5, capacity: 6, section: 'Barra' }, AUTH()),
      listParams
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.table.number).toBe(5)
    expect(body.table.capacity).toBe(6)
    expect(body.table.section).toBe('Barra')
    expect(body.table.status).toBe('free')
    expect(body.table.needsBill).toBe(false)
    expect(await Table.countDocuments({})).toBe(1)
  })

  it('reintento con el mismo posId → 200 y no duplica', async () => {
    const payload = { id: crypto.randomUUID(), number: 7, capacity: 4 }
    const first = await tablesPost(req(TABLES_URL, payload, AUTH()), listParams)
    const second = await tablesPost(req(TABLES_URL, payload, AUTH()), listParams)

    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(await Table.countDocuments({})).toBe(1)
  })

  it('posId repetido con datos distintos → 409', async () => {
    const id = crypto.randomUUID()
    await tablesPost(req(TABLES_URL, { id, number: 7, capacity: 4 }, AUTH()), listParams)
    const res = await tablesPost(req(TABLES_URL, { id, number: 8, capacity: 4 }, AUTH()), listParams)
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('idempotency_mismatch')
  })

  it('número repetido en la sede → 409', async () => {
    await createTable({ number: 4 })
    const res = await tablesPost(
      req(TABLES_URL, { id: crypto.randomUUID(), number: 4, capacity: 2 }, AUTH()),
      listParams
    )
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('conflict')
  })

  it('sin id o con number inválido → 400', async () => {
    const noId = await tablesPost(req(TABLES_URL, { number: 1, capacity: 2 }, AUTH()), listParams)
    expect(noId.status).toBe(400)

    const badNumber = await tablesPost(
      req(TABLES_URL, { id: crypto.randomUUID(), number: 0, capacity: 2 }, AUTH()),
      listParams
    )
    expect(badNumber.status).toBe(400)
    expect(await Table.countDocuments({})).toBe(0)
  })
})

describe('PATCH /pos/tables/[id]', () => {
  it('free → occupied con mesero y orden', async () => {
    const tableId = await createTable()
    const orderId = await createOrder()

    const res = await tablePatch(
      req(`${TABLES_URL}/${tableId}`, { status: 'occupied', serverId: 'mozo-1', currentOrderId: orderId }, AUTH()),
      detailParams(tableId)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.table.status).toBe('occupied')
    expect(body.table.serverId).toBe('mozo-1')
    expect(body.table.currentOrderId).toBe(orderId)
  })

  it('free → closed es un salto inválido → 409 con los destinos legales', async () => {
    const tableId = await createTable()
    const res = await tablePatch(
      req(`${TABLES_URL}/${tableId}`, { status: 'closed' }, AUTH()),
      detailParams(tableId)
    )
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('transition_invalid')
    expect(body.error.detail).toContain('Allowed:')
    expect(await Table.findOne({ posId: tableId }).lean()).toMatchObject({ status: 'free' })
  })

  it('no libera una mesa con la orden todavía en curso → 409', async () => {
    const tableId = await createTable()
    const orderId = await createOrder()
    await tablePatch(
      req(`${TABLES_URL}/${tableId}`, { status: 'occupied', currentOrderId: orderId }, AUTH()),
      detailParams(tableId)
    )

    const res = await tablePatch(
      req(`${TABLES_URL}/${tableId}`, { status: 'free' }, AUTH()),
      detailParams(tableId)
    )
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('conflict')
    expect(await Table.findOne({ posId: tableId }).lean()).toMatchObject({ status: 'occupied' })
  })

  it('libera la mesa cuando la orden terminó', async () => {
    const tableId = await createTable()
    const orderId = await createOrder()

    const delivered = await orderPatch(
      req(`${ORDERS_URL}/${orderId}`, { status: 'delivered' }, AUTH()),
      { params: Promise.resolve({ tenant: SLUG, id: orderId }) }
    )
    expect(delivered.status).toBe(200)

    await Table.updateOne(
      { posId: tableId },
      { $set: { status: 'occupied', currentOrderId: orderId } }
    )

    const res = await tablePatch(
      req(`${TABLES_URL}/${tableId}`, { status: 'free' }, AUTH()),
      detailParams(tableId)
    )
    expect(res.status).toBe(200)

    const table = await Table.findOne({ posId: tableId }).lean()
    expect(table!.status).toBe('free')
    expect(table!.currentOrderId).toBeNull()
    expect(table!.serverId).toBeNull()
  })

  it('needsBill solo cambia el flag y no toca el estado', async () => {
    const tableId = await createTable()
    await tablePatch(
      req(`${TABLES_URL}/${tableId}`, { status: 'occupied' }, AUTH()),
      detailParams(tableId)
    )

    const res = await tablePatch(
      req(`${TABLES_URL}/${tableId}`, { needsBill: true }, AUTH()),
      detailParams(tableId)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.table.needsBill).toBe(true)
    expect(body.table.status).toBe('occupied')
  })

  it('estado desconocido o body vacío → 400', async () => {
    const tableId = await createTable()

    const unknown = await tablePatch(
      req(`${TABLES_URL}/${tableId}`, { status: 'volando' }, AUTH()),
      detailParams(tableId)
    )
    expect(unknown.status).toBe(400)

    const empty = await tablePatch(
      req(`${TABLES_URL}/${tableId}`, { otraCosa: 1 }, AUTH()),
      detailParams(tableId)
    )
    expect(empty.status).toBe(400)
  })

  it('una mesa de otra sede no existe para este token → 404', async () => {
    const other = await Location.create({
      tenantId,
      name: 'Otra',
      slug: 'otra',
      address: 'x',
      isActive: true,
    })
    const foreign = await Table.create({
      tenantId,
      locationId: other._id,
      posId: crypto.randomUUID(),
      number: 50,
      capacity: 2,
      status: 'free',
    })

    const res = await tablePatch(
      req(`${TABLES_URL}/${foreign.posId}`, { status: 'occupied' }, AUTH()),
      detailParams(String(foreign.posId))
    )
    expect(res.status).toBe(404)
  })

  it('sin token → 401', async () => {
    const tableId = await createTable()
    const res = await tablePatch(
      req(`${TABLES_URL}/${tableId}`, { status: 'occupied' }, {}),
      detailParams(tableId)
    )
    expect(res.status).toBe(401)
  })
})

describe('la ruta [tenant] acepta el ObjectId (lo que el POS tiene a mano)', () => {
  // El POS decodifica `tenantId` (ObjectId) del JWT que emite apps/sync; nunca
  // ve el slug. Si la ruta exigiera slug, toda la superficie quedaría inalcanzable.
  it('GET /pos/tables con el ObjectId devuelve exactamente lo mismo que con slug', async () => {
    await createTable({ number: 1 })

    const bySlug = await tablesGet(req(TABLES_URL, undefined, AUTH(), 'GET'), listParams)
    const byId = await tablesGet(
      req(`http://localhost:3000/api/${tenantId}/pos/tables`, undefined, AUTH(), 'GET'),
      { params: Promise.resolve({ tenant: tenantId }) }
    )

    expect(bySlug.status).toBe(200)
    expect(byId.status).toBe(200)
    // `serverTime` cambia entre llamadas: comparamos solo el payload de datos.
    const slugBody = (await bySlug.json()) as { tables: unknown[] }
    const idBody = (await byId.json()) as { tables: unknown[] }
    expect(idBody.tables).toEqual(slugBody.tables)
    expect(idBody.tables).toHaveLength(1)
  })

  it('token de OTRO tenant apuntando al ObjectId ajeno → 403', async () => {
    const other = await Tenant.create({ name: 'Otro', slug: 'otro-tenant', plan: 'full' })
    const foreign = signJwt(
      {
        sub: '64b0000000000000000000b1',
        tenantId: other._id.toString(),
        role: 'cashier',
        deviceType: 'hub',
      },
      PRIVATE_PEM
    )
    const res = await tablesGet(
      req(
        `http://localhost:3000/api/${tenantId}/pos/tables`,
        undefined,
        { authorization: `Bearer ${foreign}`, 'x-location-id': locationId },
        'GET'
      ),
      { params: Promise.resolve({ tenant: tenantId }) }
    )
    expect(res.status).toBe(403)
  })
})
