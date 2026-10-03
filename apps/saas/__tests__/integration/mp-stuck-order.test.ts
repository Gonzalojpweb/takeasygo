import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'

// ── Simula el SDK de MercadoPago ────────────────────────────────────────────
// `create` lanzamos a demanda para reproducir el caso real: credenciales
// inválidas del tenant → la preferencia nunca se crea → no hay init_point.
const mpCreateMock = vi.fn()
vi.mock('mercadopago', () => ({
  MercadoPagoConfig: class {},
  Preference: class {
    create = (...args: any[]) => mpCreateMock(...args)
  },
}))

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/crypto', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/crypto')>()
  return {
    ...orig,
    decrypt: vi.fn(() => 'APP_USR-test-token'),
    encrypt: vi.fn((t: string) => `enc:${t}`),
    safeDecrypt: vi.fn((t: string) => (typeof t === 'string' ? t : '')),
  }
})

vi.mock('@/lib/loyalty', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/loyalty')>()
  return { ...orig, revertRewardRedemptions: vi.fn().mockResolvedValue(undefined) }
})

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 0 }),
}))

import { POST as cancelAwaiting } from '@/app/api/[tenant]/orders/[orderId]/cancel-awaiting/route'
import { POST as createPreference } from '@/app/api/[tenant]/payments/create-preference/route'

const SLUG = 'test-tenant'
const TRACKING_TOKEN = 'tok-abc-123'

function makeReq(url: string, method: string, headers: Record<string, string> = {}) {
  return new Request(url, { method, headers }) as any
}

function params(orderId?: string) {
  return {
    params: Promise.resolve({ tenant: SLUG, ...(orderId ? { orderId } : {}) }),
  }
}

let tenant: any
let location: any

async function makeStuckOrder(overrides: Record<string, any> = {}) {
  return Order.create({
    tenantId: tenant._id,
    locationId: location._id,
    orderNumber: `TST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    status: 'awaiting_payment',
    orderMode: 'takeaway',
    items: [{
      name: 'Cachapa',
      quantity: 1,
      basePrice: 3000,
      extraPrice: 0,
      price: 3000,
      subtotal: 3000,
    }],
    subtotal: 3000,
    total: 3000,
    customer: { name: 'Juan Pérez', phone: '+5491100000000' },
    payment: { method: 'mercadopago', status: 'pending', baseTotal: 3000 },
    trackingToken: TRACKING_TOKEN,
    ...overrides,
  })
}

const MP_ACCOUNT_ID = '64b0000000000000000000a1'

beforeEach(async () => {
  mpCreateMock.mockReset()
  mpCreateMock.mockRejectedValue(new Error('invalid_client: credenciales inválidas'))

  tenant = await Tenant.create({
    name: 'Tenant de prueba',
    slug: SLUG,
    plan: 'full',
    status: 'active',
    isActive: true,
    mpAccounts: [
      {
        _id: MP_ACCOUNT_ID,
        label: 'Cuenta rota',
        accessToken: 'enc:bad',
        publicKey: 'pub-test',
        webhookSecret: 'whsec-test',
        isActive: true,
      },
    ],
  })
  location = await Location.create({
    tenantId: tenant._id,
    name: 'Sede Centro',
    slug: 'centro',
    address: 'Av. Siempreviva 742',
    settings: { mpAccountId: MP_ACCOUNT_ID },
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   ESCENARIO 1 — El cliente quedó varado en "Esperando pago"
   MP falló en su propio checkout: no hay webhook, no hay back_url utilizable.
   El pedido vive para siempre en awaiting_payment.
   ══════════════════════════════════════════════════════════════════════════ */
describe('Cliente varado en awaiting_payment — salida de emergencia', () => {
  it('el endpoint NO queda abierto sin tracking-token (401)', async () => {
    const order = await makeStuckOrder()
    const res = await cancelAwaiting(
      makeReq(`http://localhost/api/${SLUG}/orders/${order._id}/cancel-awaiting`, 'POST'),
      params(order._id.toString())
    )
    expect(res.status).toBe(401)
    const still = await Order.findById(order._id)
    expect(still!.status).toBe('awaiting_payment')
  })

  it('rechaza tracking-token incorrecto (403)', async () => {
    const order = await makeStuckOrder()
    const res = await cancelAwaiting(
      makeReq(`http://localhost/api/${SLUG}/orders/${order._id}/cancel-awaiting`, 'POST', {
        'x-tracking-token': 'token-que-no-es',
      }),
      params(order._id.toString())
    )
    expect(res.status).toBe(403)
    expect((await Order.findById(order._id))!.status).toBe('awaiting_payment')
  })

  it('cancela con el token correcto y marca el pago como cancelado', async () => {
    const order = await makeStuckOrder()
    const res = await cancelAwaiting(
      makeReq(`http://localhost/api/${SLUG}/orders/${order._id}/cancel-awaiting`, 'POST', {
        'x-tracking-token': TRACKING_TOKEN,
      }),
      params(order._id.toString())
    )
    expect(res.status).toBe(200)

    const after = await Order.findById(order._id)
    expect(after!.status).toBe('cancelled')
    expect(after!.payment.status).toBe('cancelled')
    expect(after!.statusTimestamps.cancelledAt).toBeTruthy()
  })

  it('es idempotente: segundo intento responde 200 sin romper nada', async () => {
    const order = await makeStuckOrder()
    const call = () =>
      cancelAwaiting(
        makeReq(`http://localhost/api/${SLUG}/orders/${order._id}/cancel-awaiting`, 'POST', {
          'x-tracking-token': TRACKING_TOKEN,
        }),
        params(order._id.toString())
      )
    expect((await call()).status).toBe(200)
    expect((await call()).status).toBe(200)
    expect((await Order.findById(order._id))!.status).toBe('cancelled')
  })

  it('NO cancela un pedido que ya salió de awaiting_payment', async () => {
    const order = await makeStuckOrder({ status: 'preparing' })
    const res = await cancelAwaiting(
      makeReq(`http://localhost/api/${SLUG}/orders/${order._id}/cancel-awaiting`, 'POST', {
        'x-tracking-token': TRACKING_TOKEN,
      }),
      params(order._id.toString())
    )
    expect(res.status).toBe(400)
    expect((await Order.findById(order._id))!.status).toBe('preparing')
  })

  it('NO cancela un pedido que ya está cancelado (sin doble efecto)', async () => {
    const order = await makeStuckOrder({ status: 'cancelled' })
    const res = await cancelAwaiting(
      makeReq(`http://localhost/api/${SLUG}/orders/${order._id}/cancel-awaiting`, 'POST', {
        'x-tracking-token': TRACKING_TOKEN,
      }),
      params(order._id.toString())
    )
    expect(res.status).toBe(200)
    expect((await Order.findById(order._id))!.status).toBe('cancelled')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   ESCENARIO 2 — El fallo ocurre ANTES de llegar a MP
   (credenciales inválidas → preference.create lanza).
   La orden ya existe: sin rollback quedaría un zombie bloqueando el re-pedido.
   ══════════════════════════════════════════════════════════════════════════ */
describe('create-preference falla → rollback de la orden', () => {
  it('devuelve 500 y cancela la orden (no deja zombie)', async () => {
    const order = await makeStuckOrder()

    const res = await createPreference(
      new NextRequest(`http://localhost/api/${SLUG}/payments/create-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order._id.toString() }),
      }) as any,
      params()
    )

    expect(res.status).toBe(500)
    const after = await Order.findById(order._id)
    expect(after!.status).toBe('cancelled')
    expect(after!.payment.status).toBe('cancelled')
    expect(after!.payment.mercadopagoId).toBeFalsy()
  })

  it('la preferencia de MP nunca llegó a crearse (así lo asegura el rollback)', async () => {
    const order = await makeStuckOrder()
    await createPreference(
      new NextRequest(`http://localhost/api/${SLUG}/payments/create-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order._id.toString() }),
      }) as any,
      params()
    )
    expect(mpCreateMock).toHaveBeenCalledTimes(1)
    expect((await Order.findById(order._id))!.payment.mercadopagoId).toBeFalsy()
  })

  it('si el pedido ya avanzó, NO lo pisa con el rollback', async () => {
    const order = await makeStuckOrder({ status: 'confirmed' })
    await createPreference(
      new NextRequest(`http://localhost/api/${SLUG}/payments/create-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order._id.toString() }),
      }) as any,
      params()
    )
    expect((await Order.findById(order._id))!.status).toBe('confirmed')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   ESCENARIO 3 — Salida real desde el tracking
   El cliente navega al tracking y tiene que encontrar la puerta.
   ══════════════════════════════════════════════════════════════════════════ */
describe('Flujo completo: varado → salida', () => {
  it('el cliente puede salir en dos pasos: tracking → cancelar', async () => {
    const order = await makeStuckOrder()

    // 1. El pedido está varado (así lo ve el tracking)
    expect(order.status).toBe('awaiting_payment')

    // 2. El cliente dispara la salida con su token
    const res = await cancelAwaiting(
      makeReq(`http://localhost/api/${SLUG}/orders/${order._id}/cancel-awaiting`, 'POST', {
        'x-tracking-token': TRACKING_TOKEN,
      }),
      params(order._id.toString())
    )
    expect(res.status).toBe(200)

    // 3. Quedó liberado: puede pedir de nuevo (no dispara 409 ACTIVE_ORDER_EXISTS)
    const active = await Order.find({
      tenantId: tenant._id,
      status: { $in: ['awaiting_payment', 'pending', 'confirmed', 'preparing', 'ready'] },
    })
    expect(active).toHaveLength(0)
  })
})
