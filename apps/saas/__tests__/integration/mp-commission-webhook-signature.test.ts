import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import crypto from 'node:crypto'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

const platformClientMock = vi.fn()
const platformSecretMock = vi.fn()
vi.mock('@/lib/mp-platform', () => ({
  getPlatformMPClient: (...args: any[]) => platformClientMock(...args),
  getPlatformWebhookSecret: (...args: any[]) => platformSecretMock(...args),
}))

const paymentGetMock = vi.fn()
vi.mock('mercadopago', () => ({
  Payment: class {
    get = (...args: any[]) => paymentGetMock(...args)
  },
}))

import { POST as commissionWebhook } from '@/app/api/webhooks/mercadopago/commission/route'

const SECRET = 'whsec-platform-test'

function makeRequest(headers: Record<string, string> = {}, paymentId = '12345') {
  return new NextRequest('http://localhost/api/webhooks/mercadopago/commission', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ type: 'payment', data: { id: paymentId } }),
  })
}

function sign(paymentId: string, requestId: string, ts: string, secret = SECRET) {
  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`
  return crypto.createHmac('sha256', secret).update(manifest).digest('hex')
}

beforeEach(() => {
  vi.clearAllMocks()
  platformClientMock.mockResolvedValue({ client: {}, preApproval: {} })
  platformSecretMock.mockResolvedValue(SECRET)
  // Pago real de MP cuyo external_reference NO es de comisión → la ruta
  // responde 200 ignored, lo suficiente para probar el gate de firma.
  paymentGetMock.mockResolvedValue({ status: 'approved', external_reference: 'otra-cosa' })
})

afterEach(() => {
  delete process.env.MP_COMMISSION_WEBHOOK_MODE
})

describe('webhook mercadopago/commission — rollout de firma', () => {
  it('mode=log: sin firma procesa igual (solo log)', async () => {
    process.env.MP_COMMISSION_WEBHOOK_MODE = 'log'
    const res = await commissionWebhook(makeRequest({ 'x-request-id': 'req-1' }))
    expect(res.status).toBe(200)
    expect(paymentGetMock).toHaveBeenCalledTimes(1)
  })

  it('mode=warn: sin firma devuelve 401', async () => {
    process.env.MP_COMMISSION_WEBHOOK_MODE = 'warn'
    const res = await commissionWebhook(makeRequest({ 'x-request-id': 'req-1' }))
    expect(res.status).toBe(401)
    expect(paymentGetMock).not.toHaveBeenCalled()
  })

  it('mode=warn: firma inválida devuelve 401', async () => {
    process.env.MP_COMMISSION_WEBHOOK_MODE = 'warn'
    const res = await commissionWebhook(makeRequest({
      'x-request-id': 'req-1',
      'x-signature': `ts=1700000000,v1=${'00'.repeat(32)}`,
    }))
    expect(res.status).toBe(401)
    expect(paymentGetMock).not.toHaveBeenCalled()
  })

  it('mode=enforce: firma válida pasa y procesa', async () => {
    process.env.MP_COMMISSION_WEBHOOK_MODE = 'enforce'
    const ts = '1700000000'
    const requestId = 'req-valid-1'
    const v1 = sign('12345', requestId, ts)
    const res = await commissionWebhook(makeRequest({
      'x-request-id': requestId,
      'x-signature': `ts=${ts},v1=${v1}`,
    }))
    expect(res.status).toBe(200)
    expect(paymentGetMock).toHaveBeenCalledTimes(1)
  })

  it('mode=enforce: firma con otro secret es rechazada', async () => {
    process.env.MP_COMMISSION_WEBHOOK_MODE = 'enforce'
    const ts = '1700000000'
    const requestId = 'req-valid-2'
    const v1 = sign('12345', requestId, ts, 'otro-secret')
    const res = await commissionWebhook(makeRequest({
      'x-request-id': requestId,
      'x-signature': `ts=${ts},v1=${v1}`,
    }))
    expect(res.status).toBe(401)
    expect(paymentGetMock).not.toHaveBeenCalled()
  })

  it('mode=enforce sin secret configurado no bloquea (no se inventa firma)', async () => {
    process.env.MP_COMMISSION_WEBHOOK_MODE = 'enforce'
    platformSecretMock.mockRejectedValue(new Error('Webhook secret de plataforma no configurado.'))
    const res = await commissionWebhook(makeRequest({ 'x-request-id': 'req-1' }))
    expect(res.status).toBe(200)
  })
})
