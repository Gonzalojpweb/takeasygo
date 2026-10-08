import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { Types } from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'
import CustomerEvent from '@/models/CustomerEvent'

/**
 * Evidencia de que checkout_completed queda en UN solo evento por orden,
 * sin importar cuántos de los 10 puntos de emisión la toquen.
 *
 * - becameCompleted: criterio único (lib/events-server.ts) — solo emite en la
 *   PRIMERA transición a un estado post-compra; relecturas/polling no emiten.
 * - writeCustomerEvent: segunda capa — upsert $setOnInsert sobre el índice
 *   único parcial {tenantId, type, data.orderId} (idempotente ante concurrencia).
 */

const confirmOrderPaymentCoreMock = vi.fn().mockResolvedValue(undefined)
const notifySyncLayerStatusMock = vi.fn().mockResolvedValue(undefined)
const pushOrderToSyncLayerMock = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/sync-layer', () => ({
  confirmOrderPaymentCore: (...args: unknown[]) => confirmOrderPaymentCoreMock(...args),
  notifySyncLayerStatus: (...args: unknown[]) => notifySyncLayerStatusMock(...args),
  pushOrderToSyncLayer: (...args: unknown[]) => pushOrderToSyncLayerMock(...args),
}))

const adminPushMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/push', () => ({
  sendAdminPushNotification: (...args: unknown[]) => adminPushMock(...args),
}))

const onOrderConfirmedMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/printing', () => ({
  onOrderConfirmed: (...args: unknown[]) => onOrderConfirmedMock(...args),
}))

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/crypto', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/crypto')>()
  return {
    ...orig,
    safeDecrypt: vi.fn((t: string) => (typeof t === 'string' ? t : '')),
    decrypt: vi.fn(() => 'APP_USR-test-token'),
  }
})

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 0 }),
}))

import { POST as changePaymentMethod } from '@/app/api/[tenant]/orders/[orderId]/change-payment-method/route'
import {
  becameCompleted,
  captureCheckoutCompletedFromOrder,
  writeCustomerEvent,
} from '@/lib/events-server'

const SLUG = 'test-tenant'
const TRACKING_TOKEN = 'tok-dedup-001'

function params(orderId: string) {
  return { params: Promise.resolve({ tenant: SLUG, orderId }) }
}

function postReq(orderId: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest(
    `http://localhost/api/${SLUG}/orders/${orderId}/change-payment-method`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }
  )
}

let tenant: { _id: Types.ObjectId }
let location: { _id: Types.ObjectId }

async function makeStuckOrder(overrides: Record<string, unknown> = {}) {
  return Order.create({
    tenantId: tenant._id,
    locationId: location._id,
    orderNumber: `DEDUP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    status: 'awaiting_payment',
    orderMode: 'takeaway',
    items: [
      {
        name: 'Cachapa',
        quantity: 1,
        basePrice: 3000,
        extraPrice: 0,
        price: 3000,
        subtotal: 3000,
      },
    ],
    subtotal: 3000,
    total: 3300,
    customer: { name: 'Juan Pérez', phone: '+5491100000000' },
    payment: {
      method: 'mercadopago',
      status: 'pending',
      baseTotal: 3000,
      surchargePercent: 10,
      surchargeAmount: 300,
    },
    trackingToken: TRACKING_TOKEN,
    ...overrides,
  })
}

async function countCompleted(orderId: Types.ObjectId): Promise<number> {
  return CustomerEvent.countDocuments({
    tenantId: tenant._id,
    type: 'checkout_completed',
    'data.orderId': orderId,
  })
}

beforeEach(async () => {
  confirmOrderPaymentCoreMock.mockClear()
  notifySyncLayerStatusMock.mockClear()
  pushOrderToSyncLayerMock.mockClear()
  adminPushMock.mockClear()
  onOrderConfirmedMock.mockClear()

  tenant = await Tenant.create({
    name: 'Tenant de prueba',
    slug: SLUG,
    plan: 'full',
    status: 'active',
    isActive: true,
    cash: { enabled: true, discountPercent: 0 },
    features: { cashPaymentEnabledBySuperadmin: true },
    transfer: { enabled: true, alias: 'alias.test', cbu: '0000000000000000000000' },
  })
  location = await Location.create({
    tenantId: tenant._id,
    name: 'Sede Centro',
    slug: 'centro',
    address: 'Av. Siempreviva 742',
  })

  // Espera a que los índices (incl. el único parcial de checkout_completed)
  // estén creados: sin él el upsert concurrente no serializa.
  await CustomerEvent.init()
})

/** Los efectos de efectivo corren en setImmediate: hay que drenarlos. */
const flush = () => new Promise((r) => setImmediate(() => setImmediate(r)))

/* ══════════════════════════════════════════════════════════════════════════
   becameCompleted — el criterio único que comparten los 10 puntos
   ══════════════════════════════════════════════════════════════════════════ */
describe('becameCompleted — criterio único de checkout_completed', () => {
  it('emite cuando la orden PASA por primera vez a un estado post-compra', () => {
    // webhooks MP/Kripton, verify-payment, verify-by-number, track, reconcile
    expect(becameCompleted('awaiting_payment', 'confirmed')).toBe(true)
    // confirm-transfer-admin
    expect(becameCompleted('awaiting_confirmation', 'confirmed')).toBe(true)
    // POST /orders: efectivo nace confirmada (no hay estado previo)
    expect(becameCompleted(undefined, 'confirmed')).toBe(true)
    expect(becameCompleted('pending', 'confirmed')).toBe(true)
  })

  it('NO emite en relecturas, polling ni replays', () => {
    // relectura con pago ya aprobado (verify/reconcile/track repetidos)
    expect(becameCompleted('confirmed', 'confirmed')).toBe(false)
    // orden ya en flujo de cocina
    expect(becameCompleted('preparing', 'confirmed')).toBe(false)
    expect(becameCompleted('delivered', 'confirmed')).toBe(false)
    // sin transición real
    expect(becameCompleted('awaiting_payment', 'awaiting_payment')).toBe(false)
    expect(becameCompleted('awaiting_payment', 'cancelled')).toBe(false)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   3 caminos de confirmación para la MISMA orden → 1 solo evento
   ══════════════════════════════════════════════════════════════════════════ */
describe('checkout_completed — dedup multi-camino', () => {
  it('change-payment→cash (ruta real) + webhook tardío + polling + fallback client → 1 doc', async () => {
    const order = await makeStuckOrder()

    // ── Camino 1: change-payment-method → cash (RUTA REAL) ──────────────
    // La orden transiciona awaiting_payment → confirmed acá y la ruta emite.
    const res = await changePaymentMethod(
      postReq(order._id.toString(), { method: 'cash' }, { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    expect(res.status).toBe(200)
    await flush()

    const confirmed = await Order.findById(order._id)
    expect(confirmed!.status).toBe('confirmed')
    expect(await countCompleted(order._id)).toBe(1)

    // ── Camino 2: webhook MP tardío (la orden YA está confirmada) ───────
    // prev = confirmed → el gate no emite.
    await captureCheckoutCompletedFromOrder(confirmed!, tenant._id, confirmed!.status)

    // ── Camino 3: polling de verify / reconcile (relectura) ─────────────
    await captureCheckoutCompletedFromOrder(confirmed!, tenant._id, 'confirmed')

    // ── Camino 4: fallback client (order-success → POST /events) ────────
    // Mismo upsert $setOnInsert sobre {tenantId, type, data.orderId}.
    await writeCustomerEvent({
      tenantId: tenant._id,
      type: 'checkout_completed',
      data: { orderId: order._id, amount: 3000, quantity: 1 },
      metadata: { source: 'client_side' },
    })

    expect(await countCompleted(order._id)).toBe(1)
  })

  it('dos confirmaciones concurrentes (webhook + verify) + fallback → 1 doc (upsert atómico)', async () => {
    const order = await makeStuckOrder()

    // Misma transición vista por dos puntos a la vez (race real):
    // ambos pasarían el gate, el índice único serializa el upsert.
    const previousStatus = order.status
    order.status = 'confirmed'

    await Promise.all([
      captureCheckoutCompletedFromOrder(order, tenant._id, previousStatus),
      captureCheckoutCompletedFromOrder(order, tenant._id, previousStatus),
      writeCustomerEvent({
        tenantId: tenant._id,
        type: 'checkout_completed',
        data: { orderId: order._id },
        metadata: { source: 'client_side' },
      }),
    ])

    expect(await countCompleted(order._id)).toBe(1)
  })

  it('órdenes distintas no se pisan entre sí', async () => {
    const a = await makeStuckOrder()
    const b = await makeStuckOrder()
    a.status = 'confirmed'
    b.status = 'confirmed'

    await captureCheckoutCompletedFromOrder(a, tenant._id, 'awaiting_payment')
    await captureCheckoutCompletedFromOrder(b, tenant._id, 'awaiting_payment')

    expect(await countCompleted(a._id)).toBe(1)
    expect(await countCompleted(b._id)).toBe(1)
  })
})
