import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'
import { encrypt } from '@/lib/crypto'
import { computePosWebhookSignature } from '@/lib/pos-webhook-signature'

/**
 * S1-1 — Webhook POS con firma obligatoria (negativos reales sobre la ruta).
 *
 * Contrato nuevo: sin `X-POS-Signature` → 401 antes de tocar la DB; firma
 * inválida o body alterado → 401; `timestamp` del body firmado obligatorio
 * dentro de ±300s (anti-replay); sandbox solo con POS_WEBHOOK_ALLOW_UNSIGNED=1.
 */

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/pos', () => ({
  getPOSConnector: vi.fn(() => ({
    mapEventToOrderStatus: (event: string) =>
      event === 'ORDER-CONFIRMED' ? 'confirmed' : null,
  })),
}))

import { POST } from '@/app/api/webhooks/pos/[tenant]/route'

// setup.ts fija una clave hex pensada para otros tests; crypto.ts espera
// base64 de 32 bytes (aes-256-gcm). Se sobreescribe ANTES del primer encrypt.
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')

const SLUG = 'test-tenant'
const SECRET = 'pos-webhook-secret-test'
const ORDER_NUMBER = 'REST-1001'
const params = { params: Promise.resolve({ tenant: SLUG }) }

let locationId: string

function req(bodyStr: string, headers: Record<string, string> = {}, slug = SLUG) {
  return new Request(`http://localhost:3000/api/webhooks/pos/${slug}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: bodyStr,
  }) as unknown as NextRequest
}

function signedBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event: 'ORDER-CONFIRMED',
    externalOrderId: ORDER_NUMBER,
    timestamp: new Date().toISOString(),
    ...overrides,
  })
}

function signedHeaders(bodyStr: string, secret = SECRET): Record<string, string> {
  return {
    'x-pos-provider': 'fudo',
    'x-pos-signature': computePosWebhookSignature(secret, bodyStr),
  }
}

beforeEach(async () => {
  const tenant = await Tenant.create({
    name: 'Test Tenant',
    slug: SLUG,
    plan: 'full',
    posIntegration: {
      provider: 'fudo',
      enabled: true,
      webhookSecret: encrypt(SECRET),
    },
  })
  const location = await Location.create({
    tenantId: tenant._id,
    name: 'Sede Centro',
    slug: 'centro',
    address: 'Av. Siempreviva 742',
  })
  locationId = location._id.toString()

  await Order.create({
    tenantId: tenant._id,
    locationId,
    orderNumber: ORDER_NUMBER,
    status: 'pending',
    orderMode: 'takeaway',
    items: [
      { name: 'Cachapa', quantity: 1, basePrice: 3000, extraPrice: 0, price: 3000, subtotal: 3000 },
    ],
    subtotal: 3000,
    total: 3300,
    customer: { name: 'Juan Perez', phone: '+5491100000000' },
    payment: {
      method: 'cash',
      status: 'pending',
      baseTotal: 3000,
      surchargePercent: 10,
      surchargeAmount: 300,
    },
  })
})

afterEach(() => {
  delete process.env.POS_WEBHOOK_ALLOW_UNSIGNED
})

describe('POST /api/webhooks/pos/[tenant] — firma obligatoria (negativos)', () => {
  it('sin firma → 401 Firma requerida', async () => {
    const res = await POST(req(signedBody(), { 'x-pos-provider': 'fudo' }), params)
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Firma requerida')
  })

  it('rechaza ANTES de existencia del tenant → 401 (no enumera tenants)', async () => {
    const res = await POST(
      req(signedBody(), { 'x-pos-provider': 'fudo' }, 'tenant-inexistente'),
      { params: Promise.resolve({ tenant: 'tenant-inexistente' }) }
    )
    expect(res.status).toBe(401)
  })

  it('rechaza ANTES de parsear el body → 401 con JSON basura', async () => {
    const res = await POST(req('esto no es json', { 'x-pos-provider': 'fudo' }), params)
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Firma requerida')
  })

  it('firma con OTRO secreto → 401 Invalid signature', async () => {
    const bodyStr = signedBody()
    const res = await POST(
      req(bodyStr, signedHeaders(bodyStr, 'secreto-equivocado')),
      params
    )
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Invalid signature')
  })

  it('body alterado después de firmar → 401 Invalid signature', async () => {
    const bodyStr = signedBody()
    const headers = signedHeaders(bodyStr)
    const alterado = bodyStr.replace(ORDER_NUMBER, 'REST-999')
    const res = await POST(req(alterado, headers), params)
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Invalid signature')
  })

  it('firma no-hex → 401 Invalid signature (sin lanzar)', async () => {
    const bodyStr = signedBody()
    const res = await POST(
      req(bodyStr, { 'x-pos-provider': 'fudo', 'x-pos-signature': 'zz'.repeat(32) }),
      params
    )
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Invalid signature')
  })
})

describe('POST /api/webhooks/pos/[tenant] — anti-replay por timestamp', () => {
  it('timestamp viejo (10 min) con firma válida → 401', async () => {
    const bodyStr = signedBody({
      timestamp: new Date(Date.now() - 600_000).toISOString(),
    })
    const res = await POST(req(bodyStr, signedHeaders(bodyStr)), params)
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Timestamp fuera de ventana')
  })

  it('sin timestamp en el body → 401 Falta timestamp', async () => {
    const bodyStr = JSON.stringify({
      event: 'ORDER-CONFIRMED',
      externalOrderId: ORDER_NUMBER,
    })
    const res = await POST(req(bodyStr, signedHeaders(bodyStr)), params)
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Falta timestamp')
  })

  it('firma válida sobre timestamp viejo de una captura → 401 (replay)', async () => {
    const viejo = new Date(Date.now() - 4000_000).toISOString()
    const bodyStr = signedBody({ timestamp: viejo })
    const res = await POST(req(bodyStr, signedHeaders(bodyStr)), params)
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Timestamp fuera de ventana')
  })
})

describe('POST /api/webhooks/pos/[tenant] — caminos válidos', () => {
  it('firma válida + timestamp fresco → 200 y la orden pasa a confirmed', async () => {
    const bodyStr = signedBody()
    const res = await POST(req(bodyStr, signedHeaders(bodyStr)), params)
    expect(res.status).toBe(200)
    expect((await res.json()).received).toBe(true)

    const stored = await Order.findOne({ orderNumber: ORDER_NUMBER }).lean()
    expect(stored!.status).toBe('confirmed')
    expect(stored!.statusTimestamps.confirmedAt).toBeTruthy()
  })

  it('firma válida pero tenant sin webhookSecret → 400 Webhook not configured', async () => {
    await Tenant.updateOne({ slug: SLUG }, { $unset: { posIntegration: '' } })
    const bodyStr = signedBody()
    const res = await POST(req(bodyStr, signedHeaders(bodyStr)), params)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Webhook not configured')
  })

  it('sandbox con POS_WEBHOOK_ALLOW_UNSIGNED=1 y sin firma → 200', async () => {
    process.env.POS_WEBHOOK_ALLOW_UNSIGNED = '1'
    const bodyStr = signedBody()
    const res = await POST(req(bodyStr, { 'x-pos-provider': 'fudo' }), params)
    expect(res.status).toBe(200)
  })

  it('la flag no relaja una firma presente pero inválida → 401', async () => {
    process.env.POS_WEBHOOK_ALLOW_UNSIGNED = '1'
    const bodyStr = signedBody()
    const res = await POST(
      req(bodyStr, signedHeaders(bodyStr, 'secreto-equivocado')),
      params
    )
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Invalid signature')
  })
})
