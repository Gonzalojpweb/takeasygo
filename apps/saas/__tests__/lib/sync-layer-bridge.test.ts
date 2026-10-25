// ============================================================================
// sync-layer-bridge.test.ts — puente SaaS → Sync → POS (bug 2026-10-25)
// ============================================================================
// «Los pedidos de la App impactan en el SaaS pero no en el POS»:
//   1. el alta del pedido al Sync quedaba como promesa suelta → Vercel la
//      cortaba al responder. Ahora corre con runAfterResponse y reintenta.
//   2. la venta cobrada (cash_sale) iba con `total` y sin `orderMode`; el
//      Sync exige `amount` + `orderMode` → 400 en todas. Ahora coincide y
//      lleva la sede (POS multisede).
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import mongoose from 'mongoose'

const orderId = new mongoose.Types.ObjectId()
const locationId = new mongoose.Types.ObjectId()

async function loadModule() {
  vi.resetModules()
  vi.stubEnv('SYNC_LAYER_URL', 'https://sync.test')
  vi.stubEnv('SYNC_LAYER_SECRET', 'secreto')
  return import('@/lib/sync-layer')
}

const order = {
  _id: orderId,
  tenantId: new mongoose.Types.ObjectId(),
  total: 1_250_000,
  items: [{ name: 'Milanesa', quantity: 2, price: 500_000, subtotal: 1_000_000 }],
  payment: { method: 'mercadopago' },
  orderMode: 'delivery',
  locationId,
}

beforeEach(() => { vi.useRealTimers() })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('venta cobrada → Sync (cash_sale)', () => {
  it('manda amount, orderMode y la sede: lo que el Sync valida', async () => {
    const { buildCashSalePayload } = await loadModule()
    const p = buildCashSalePayload(order, 'tenant-1')
    expect(p).toMatchObject({ orderId: String(orderId), tenantId: 'tenant-1', amount: 1_250_000, orderMode: 'delivery', paymentMethod: 'mercadopago', locationId: String(locationId) })
    expect(p).not.toHaveProperty('total')
  })

  it('modo o medio desconocidos caen a valores que el Sync acepta', async () => {
    const { buildCashSalePayload } = await loadModule()
    const p = buildCashSalePayload({ ...order, orderMode: 'otro', payment: { method: 'gift' }, locationId: null }, 't')
    expect(p.orderMode).toBe('takeaway')
    expect(p.paymentMethod).toBe('mercadopago')
    expect(p).not.toHaveProperty('locationId')
  })
})

describe('alta del pedido → Sync (order:created)', () => {
  const payload = { tenantId: 't', externalOrderId: 'o1', locationId: 'l1', items: [], total: 100 }

  it('reintenta ante 5xx / red caída y termina aceptado', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('boom', { status: 502 }))
      .mockResolvedValueOnce(new Response('{}', { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
    const { pushOrderToSyncLayer } = await loadModule()
    const done = pushOrderToSyncLayer(payload)
    await vi.runAllTimersAsync()
    expect(await done).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body)).toMatchObject({ externalOrderId: 'o1', locationId: 'l1' })
  })

  it('un 4xx no se reintenta (payload inválido)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)
    const { pushOrderToSyncLayer } = await loadModule()
    expect(await pushOrderToSyncLayer(payload)).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('el alta corre con runAfterResponse (no como promesa suelta)', () => {
  it('syncOrderAfterStatusSet agenda el push con runAfterResponse', async () => {
    vi.resetModules()
    const runAfterResponse = vi.fn()
    vi.doMock('@/lib/after-response', () => ({ runAfterResponse }))
    vi.doMock('@/lib/sync-layer', () => ({ pushOrderToSyncLayer: vi.fn(), confirmOrderPaymentCore: vi.fn(), notifySyncLayerStatus: vi.fn() }))
    vi.doMock('@/lib/push', () => ({ sendAdminPushNotification: vi.fn() }))
    const { syncOrderAfterStatusSet } = await import('@/lib/order-side-effects')
    await syncOrderAfterStatusSet({
      order: { _id: orderId, status: 'awaiting_payment', total: 100, payment: { method: 'mercadopago' }, orderMode: 'takeaway', notes: '' } as never,
      tenant: { _id: new mongoose.Types.ObjectId(), features: { posEnabled: true } } as never,
      items: [{ name: 'X', quantity: 1, price: 100, subtotal: 100 }],
      locationId: String(locationId),
    })
    expect(runAfterResponse).toHaveBeenCalledWith('pushOrderToSyncLayer', expect.any(Function))
    vi.doUnmock('@/lib/after-response')
    vi.doUnmock('@/lib/sync-layer')
    vi.doUnmock('@/lib/push')
  })
})
