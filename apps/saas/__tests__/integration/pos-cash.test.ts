import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import CashRegister from '@/models/CashRegister'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

import { GET as registersGet, POST as registersPost } from '@/app/api/[tenant]/pos/cash/registers/route'
import { GET as registerGet } from '@/app/api/[tenant]/pos/cash/registers/[id]/route'
import { POST as movementPost } from '@/app/api/[tenant]/pos/cash/registers/[id]/movements/route'
import { POST as closePost } from '@/app/api/[tenant]/pos/cash/registers/[id]/close/route'

/**
 * M4 — superficie POS: caja.
 *
 * Las tres reglas del Consenso v1 están del lado del server:
 *   §1  el arqueo solo se mueve con efectivo (cashExpectedDelta)
 *   §2.1 un (registerId, relatedOrderId, type) repetido devuelve el existente
 *   §3  el Z se genera UNA VEZ al cerrar y el arqueo se recalcula desde los
 *       movimientos reales (no se confía en el valor denormalizado)
 */

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

const SLUG = 'test-tenant'
const REG_URL = `http://localhost:3000/api/${SLUG}/pos/cash/registers`

let tenantId: string
let locationId: string

function token(): string {
  return signJwt(
    { sub: '64b0000000000000000000a1', tenantId, role: 'cashier', deviceType: 'hub' },
    PRIVATE_PEM
  )
}

// Siempre declara la sede: el server no debe elegir una por su cuenta.
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

async function openRegister(overrides: Record<string, unknown> = {}, registerId?: string) {
  return registersPost(
    req(REG_URL, { id: registerId ?? crypto.randomUUID(), initialAmount: 100000, ...overrides }, AUTH()),
    listParams
  )
}

async function addMovement(
  registerId: string,
  overrides: Record<string, unknown>,
  headers: Record<string, string> = {}
) {
  return movementPost(
    req(
      `${REG_URL}/${registerId}/movements`,
      {
        id: crypto.randomUUID(),
        type: 'sale',
        amount: 1500,
        reason: 'Venta mostrador',
        channel: 'counter',
        paymentMethod: 'cash',
        ...overrides,
      },
      { ...AUTH(), ...headers }
    ),
    detailParams(registerId)
  )
}

async function close(registerId: string, finalAmount: number, headers: Record<string, string> = {}) {
  return closePost(
    req(`${REG_URL}/${registerId}/close`, { finalAmount }, { ...AUTH(), ...headers }),
    detailParams(registerId)
  )
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

describe('POST /pos/cash/registers — apertura', () => {
  it('abre con arqueo inicial igual al efectivo contado', async () => {
    const res = await openRegister({ defaultForChannel: 'counter' })
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.register.status).toBe('open')
    expect(body.register.initialAmount).toBe(100000)
    expect(body.register.expectedAmount).toBe(100000)
    expect(body.register.movements).toEqual([])
    expect(body.register.defaultForChannel).toBe('counter')
    expect(await CashRegister.countDocuments({})).toBe(1)
  })

  it('el mismo posId no duplica la caja', async () => {
    const id = crypto.randomUUID()
    const first = await openRegister({}, id)
    const second = await openRegister({}, id)

    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(await CashRegister.countDocuments({})).toBe(1)
  })

  it('misma caja reabierta con datos distintos → 409', async () => {
    const id = crypto.randomUUID()
    await openRegister({ initialAmount: 100000 }, id)
    const res = await openRegister({ initialAmount: 50000 }, id)

    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('idempotency_mismatch')
  })

  it('una segunda caja distinta en la misma sede → 409', async () => {
    await openRegister()
    const res = await openRegister()

    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('conflict')
    expect(await CashRegister.countDocuments({})).toBe(1)
  })

  it('initialAmount no entero o negativo → 400', async () => {
    const fractional = await openRegister({ initialAmount: 100.5 })
    expect(fractional.status).toBe(400)

    const negative = await openRegister({ initialAmount: -1 })
    expect(negative.status).toBe(400)

    expect(await CashRegister.countDocuments({})).toBe(0)
  })

  it('sin token → 401', async () => {
    const res = await registersPost(
      req(REG_URL, { id: crypto.randomUUID(), initialAmount: 1000 }),
      listParams
    )
    expect(res.status).toBe(401)
    expect(await CashRegister.countDocuments({})).toBe(0)
  })
})

describe('GET /pos/cash/registers', () => {
  it('filtra por status', async () => {
    const open = await openRegister()
    const openId = (await open.json()).register.id

    const abiertas = await registersGet(req(`${REG_URL}?status=open`, undefined, AUTH(), 'GET'), listParams)
    expect((await abiertas.json()).registers).toHaveLength(1)

    await close(openId, 100000)

    const cerradas = await registersGet(req(`${REG_URL}?status=closed`, undefined, AUTH(), 'GET'), listParams)
    const body = await cerradas.json()
    expect(body.registers).toHaveLength(1)
    expect(body.registers[0].status).toBe('closed')
    expect(body.registers[0].zReport).toBeTruthy()
    expect(body.registers[0].shareToken).toBeTruthy()

    const abiertas2 = await registersGet(req(`${REG_URL}?status=open`, undefined, AUTH(), 'GET'), listParams)
    expect((await abiertas2.json()).registers).toHaveLength(0)
  })

  it('status desconocido → 400', async () => {
    const res = await registersGet(req(`${REG_URL}?status=volando`, undefined, AUTH(), 'GET'), listParams)
    expect(res.status).toBe(400)
  })

  it('sin token → 401', async () => {
    const res = await registersGet(req(REG_URL, undefined, {}, 'GET'), listParams)
    expect(res.status).toBe(401)
  })

  it('la caja de otra sede no aparece', async () => {
    const other = await Location.create({
      tenantId,
      name: 'Otra',
      slug: 'otra',
      address: 'x',
      isActive: true,
    })
    await CashRegister.create({
      posId: crypto.randomUUID(),
      tenantId,
      locationId: other._id,
      openedBy: 'x',
      openedAt: new Date(),
      initialAmount: 1,
      expectedAmount: 1,
      status: 'open',
    })

    const res = await registersGet(req(REG_URL, undefined, AUTH(), 'GET'), listParams)
    expect((await res.json()).registers).toHaveLength(0)
  })
})

describe('POST /pos/cash/registers/[id]/movements', () => {
  it('solo el efectivo mueve el arqueo (§1)', async () => {
    const reg = await openRegister()
    const registerId = (await reg.json()).register.id

    const efectivo = await addMovement(registerId, { amount: 1500, paymentMethod: 'cash' })
    expect(efectivo.status).toBe(201)
    expect((await efectivo.json()).register.expectedAmount).toBe(101500)

    const mp = await addMovement(registerId, { amount: 2000, paymentMethod: 'mercadopago' })
    expect(mp.status).toBe(201)
    expect((await mp.json()).register.expectedAmount).toBe(101500)

    const egreso = await addMovement(registerId, {
      type: 'expense',
      amount: 500,
      reason: 'Compra de hielo',
      paymentMethod: 'cash',
    })
    expect(egreso.status).toBe(201)
    const body = await egreso.json()
    expect(body.register.expectedAmount).toBe(101000)
    expect(body.register.movements).toHaveLength(3)
    expect(body.movement.amount).toBe(500)
    expect(body.movement.id).toBeTruthy()
  })

  it('reintento por (relatedOrderId, type) devuelve el existente (§2.1)', async () => {
    const reg = await openRegister()
    const registerId = (await reg.json()).register.id
    const orderId = crypto.randomUUID()

    const first = await addMovement(registerId, { relatedOrderId: orderId, amount: 1500 })
    const second = await addMovement(registerId, { relatedOrderId: orderId, amount: 1500 })

    expect(first.status).toBe(201)
    expect(second.status).toBe(200)

    const detail = await registerGet(req(`${REG_URL}/${registerId}`, undefined, AUTH(), 'GET'), detailParams(registerId))
    const detailBody = await detail.json()
    expect(detailBody.register.movements).toHaveLength(1)
    expect(detailBody.register.expectedAmount).toBe(101500)
  })

  it('mismo hecho con monto distinto → 409', async () => {
    const reg = await openRegister()
    const registerId = (await reg.json()).register.id
    const orderId = crypto.randomUUID()

    await addMovement(registerId, { relatedOrderId: orderId, amount: 1500 })
    const res = await addMovement(registerId, { relatedOrderId: orderId, amount: 9999 })

    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('idempotency_mismatch')
  })

  it('mismo posId con payload idéntico → 200 sin duplicar', async () => {
    const reg = await openRegister()
    const registerId = (await reg.json()).register.id
    const movementId = crypto.randomUUID()

    const first = await addMovement(registerId, { id: movementId, amount: 1500 })
    const second = await addMovement(registerId, { id: movementId, amount: 1500 })

    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect((await second.json()).register.movements).toHaveLength(1)
  })

  it('mismo posId con contenido distinto → 409', async () => {
    const reg = await openRegister()
    const registerId = (await reg.json()).register.id
    const movementId = crypto.randomUUID()

    await addMovement(registerId, { id: movementId, amount: 1500 })
    const res = await addMovement(registerId, {
      id: movementId,
      amount: 1500,
      relatedOrderId: crypto.randomUUID(),
    })

    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('idempotency_mismatch')
  })

  it('validaciones del body → 400', async () => {
    const reg = await openRegister()
    const registerId = (await reg.json()).register.id

    const zero = await addMovement(registerId, { amount: 0 })
    expect(zero.status).toBe(400)

    const badType = await addMovement(registerId, { type: 'volando' })
    expect(badType.status).toBe(400)

    const badPayment = await addMovement(registerId, { paymentMethod: 'bitcoin' })
    expect(badPayment.status).toBe(400)
  })

  it('la caja tiene que existir en esta sede y estar abierta', async () => {
    const reg = await openRegister()
    const registerId = (await reg.json()).register.id

    const other = await Location.create({
      tenantId,
      name: 'Otra',
      slug: 'otra',
      address: 'x',
      isActive: true,
    })
    const foreign = await CashRegister.create({
      posId: crypto.randomUUID(),
      tenantId,
      locationId: other._id,
      openedBy: 'x',
      openedAt: new Date(),
      initialAmount: 1,
      expectedAmount: 1,
      status: 'open',
    })

    const foreignRes = await addMovement(String(foreign.posId), {})
    expect(foreignRes.status).toBe(404)

    await close(registerId, 100000)
    const closedRes = await addMovement(registerId, {})
    expect(closedRes.status).toBe(409)
    expect((await closedRes.json()).error.code).toBe('conflict')
  })
})

describe('POST /pos/cash/registers/[id]/close — Z report', () => {
  it('calcula diferencia y genera el snapshot inmutable (§3)', async () => {
    const reg = await openRegister()
    const registerId = (await reg.json()).register.id

    await addMovement(registerId, { amount: 1500, paymentMethod: 'cash' })
    await addMovement(registerId, { amount: 2000, paymentMethod: 'mercadopago' })
    await addMovement(registerId, {
      type: 'expense',
      amount: 500,
      reason: 'Retiro',
      paymentMethod: 'cash',
    })

    const res = await close(registerId, 101000)
    expect(res.status).toBe(200)

    const { register } = await res.json()
    expect(register.status).toBe('closed')
    expect(register.expectedAmount).toBe(101000)
    expect(register.finalAmount).toBe(101000)
    expect(register.difference).toBe(0)
    expect(register.shareToken).toBeTruthy()
    expect(register.zReport.registerId).toBe(registerId)
    expect(register.zReport.totalMovements).toBe(3)
    // `sales` se desglosa por CANAL, no por método de pago: las dos ventas
    // (efectivo + mercadopago) son de mostrador.
    expect(register.zReport.byChannel.counter.sales).toBe(3500)
    expect(register.zReport.byChannel.counter.movementCount).toBe(3)
    expect(register.zReport.byPaymentMethod.cash).toBe(1000)
    expect(register.zReport.byPaymentMethod.mercadopago).toBe(2000)
  })

  it('el arqueo se recalcula desde los movimientos al cerrar', async () => {
    const reg = await openRegister()
    const registerId = (await reg.json()).register.id

    await addMovement(registerId, { amount: 1500, paymentMethod: 'cash' })

    // Deriva forzada: el valor denormalizado no es la fuente de verdad.
    await CashRegister.updateOne({ posId: registerId }, { $set: { expectedAmount: 999999 } })

    const res = await close(registerId, 101500)
    const { register } = await res.json()

    expect(register.expectedAmount).toBe(101500)
    expect(register.zReport.expectedAmount).toBe(101500)
    expect(register.difference).toBe(0)
  })

  it('reporta el faltante cuando el conteo no coincide', async () => {
    const reg = await openRegister()
    const registerId = (await reg.json()).register.id

    const res = await close(registerId, 99000)
    const { register } = await res.json()

    expect(register.expectedAmount).toBe(100000)
    expect(register.difference).toBe(-1000)
    expect(register.zReport.difference).toBe(-1000)
  })

  it('no se puede cerrar dos veces', async () => {
    const reg = await openRegister()
    const registerId = (await reg.json()).register.id

    const first = await close(registerId, 100000)
    expect(first.status).toBe(200)

    const second = await close(registerId, 100000)
    expect(second.status).toBe(409)
    expect((await second.json()).error.code).toBe('conflict')
  })

  it('finalAmount negativo → 400 y la caja sigue abierta', async () => {
    const reg = await openRegister()
    const registerId = (await reg.json()).register.id

    const res = await close(registerId, -1)
    expect(res.status).toBe(400)

    const detail = await registerGet(req(`${REG_URL}/${registerId}`, undefined, AUTH(), 'GET'), detailParams(registerId))
    expect((await detail.json()).register.status).toBe('open')
  })

  it('sin token → 401', async () => {
    const reg = await openRegister()
    const registerId = (await reg.json()).register.id

    const res = await closePost(
      req(`${REG_URL}/${registerId}/close`, { finalAmount: 0 }),
      detailParams(registerId)
    )
    expect(res.status).toBe(401)
  })
})
