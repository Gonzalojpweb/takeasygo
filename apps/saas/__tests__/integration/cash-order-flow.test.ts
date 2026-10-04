import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import Printer from '@/models/Printer'
import Order from '@/models/Order'
import PlatformConfig from '@/models/PlatformConfig'
import type { ITenant } from '@/models/Tenant'
import type { ILocation } from '@/models/Location'
import type { NextRequest } from 'next/server'

/**
 * Flujo de pedidos en EFECTIVO — fin a fin.
 *
 * Cadena de semántica:
 *   1. Creación: confirmed + payment.pending (cobra contra entrega).
 *   2. Impresión: si hay BARRA, el pedido sale SOLO en la barra
 *      (ticket completo forzado si el rol no matchea) y cocina queda
 *      diferido con kitchenPrintDeferred = true.
 *   3. Al pasar a preparación, el cajero decide en el modal:
 *      printKitchen true → comanda en cocina ahora; false → sin comanda.
 *      (Sin printKitchen — rutas sin UI como POS — se imprime por defecto.)
 *   4. delivered: pending → approved + venta en caja (confirmOrderPaymentCore).
 *   5. cancelado: pending → cancelled y el flag diferido se limpia sin imprimir.
 *
 * NO-BARRA / no-efectivo: flujo histórico intacto (todas las impresoras).
 */

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'admin-id', role: 'superadmin', tenantSlug: 'test-tenant' },
  }),
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'admin-id', role: 'superadmin' } }),
  getSessionUser: vi.fn().mockReturnValue({ id: 'admin-id', role: 'superadmin' }),
}))

vi.mock('@/lib/crypto', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/crypto')>()
  return {
    ...orig,
    encrypt: vi.fn((text: string) => `encrypted:${text}`),
    safeDecrypt: vi.fn((text: string) => text.replace(/^encrypted:/, '')),
  }
})

vi.mock('@/lib/consumer', () => ({
  upsertConsumerFromOrder: vi.fn().mockResolvedValue(undefined),
  upsertConsumerFromLoyaltyMember: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/push', () => ({
  sendAdminPushNotification: vi.fn().mockResolvedValue(undefined),
}))

const confirmOrderPaymentCoreMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/sync-layer', () => ({
  pushOrderToSyncLayer: vi.fn().mockResolvedValue(undefined),
  confirmOrderPaymentCore: (...args: unknown[]) => confirmOrderPaymentCoreMock(...args),
  notifySyncLayerStatus: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/whatsapp', () => ({ sendWhatsApp: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/whatsapp-message', () => ({ buildOrderWhatsAppMessage: vi.fn().mockReturnValue('') }))
vi.mock('@/lib/impact', () => ({ registerImpactEvent: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@/lib/hidden-rewards', () => ({
  getDeviceIdIfExists: vi.fn().mockReturnValue(null),
  finalizeHiddenRewardClaims: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/corporateAccess', () => ({ corporateHasAccess: vi.fn().mockResolvedValue(false) }))

vi.mock('@/lib/pricing', () => ({
  calculateFinalTotal: vi.fn().mockReturnValue({
    finalTotal: 8000,
    baseTotal: 8000,
    surchargeAmount: 0,
    surchargePercent: 0,
    platformFeeAmount: 0,
  }),
}))

vi.mock('@/lib/cash', () => ({ resolveCashConfig: vi.fn().mockReturnValue({ discountPercent: 0 }) }))
vi.mock('@/lib/geocode', () => ({ calculateDeliveryCost: vi.fn().mockResolvedValue(0) }))
vi.mock('@/lib/scheduled-orders', () => ({ validateScheduledPickupTime: vi.fn().mockReturnValue({ valid: true }) }))
vi.mock('@/lib/availability', () => ({ isServiceOpen: vi.fn().mockReturnValue(true) }))

vi.mock('@/lib/loyalty', () => ({
  validateCheckoutRewards: vi.fn().mockReturnValue({ valid: true, items: [] }),
  addPointsFromOrder: vi.fn().mockResolvedValue(undefined),
  revertRewardRedemptions: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/plans', () => ({
  canAccess: vi.fn().mockReturnValue(true),
  LOYALTY_MEMBER_LIMIT: { full: 10000 },
}))

vi.mock('@/lib/orderNumber', () => ({ generateOrderNumber: vi.fn().mockReturnValue('ORD-001') }))

vi.mock('web-push', () => {
  const mock = { setVapidDetails: vi.fn(), sendNotification: vi.fn() }
  return { __esModule: true, default: mock, setVapidDetails: vi.fn(), sendNotification: vi.fn() }
})

vi.mock('@takeasygo/business', () => ({
  resolveHalfPriceCustomizations: vi.fn().mockReturnValue([]),
}))

vi.mock('@/lib/hooks/useEstimatedTimeAdjustment', () => ({
  triggerBackgroundAdjustment: vi.fn(),
}))

vi.mock('@/lib/events', () => ({
  captureOrderStatusChanged: vi.fn(),
}))

import { POST as createOrderPOST } from '@/app/api/[tenant]/orders/route'
import { PATCH as statusPATCH } from '@/app/api/[tenant]/orders/[orderId]/status/route'
import { onOrderConfirmed } from '@/lib/printing/onOrderConfirmed'

const SLUG = 'test-tenant'
const flush = () => new Promise((r) => setImmediate(() => setImmediate(r)))

async function waitFor(cond: () => Promise<boolean>, timeoutMs = 4000) {
  const start = Date.now()
  for (;;) {
    if (await cond()) return
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: condición no cumplida')
    await new Promise((r) => setTimeout(r, 25))
  }
}

function statusReq(orderId: string, body: object): NextRequest {
  return new Request(`http://localhost:3000/api/${SLUG}/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

function statusParams(orderId: string) {
  return { params: Promise.resolve({ tenant: SLUG, orderId }) }
}

const INTERNAL_SECRET = 'sync-test-secret'

function internalStatusReq(orderId: string, body: object): NextRequest {
  return new Request(`http://localhost:3000/api/${SLUG}/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': INTERNAL_SECRET },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

function createReq(body: object): NextRequest {
  return new Request(`http://localhost:3000/api/${SLUG}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

const createParams = { params: Promise.resolve({ tenant: SLUG }) }

function kitchenItem() {
  return {
    itemType: 'menuItem',
    name: 'Milanesa',
    categoryName: 'Platos',
    basePrice: 5000,
    price: 5000,
    quantity: 1,
    subtotal: 5000,
    printRole: 'kitchen',
    customizations: [],
  }
}

function barItem() {
  return {
    itemType: 'menuItem',
    name: 'Cerveza',
    categoryName: 'Bebidas',
    basePrice: 3000,
    price: 3000,
    quantity: 1,
    subtotal: 3000,
    printRole: 'bar',
    customizations: [],
  }
}

function pendingJob(printerId: mongoose.Types.ObjectId, printerName: string, role: string) {
  return {
    printerId,
    printerName,
    role,
    payload: 'BASE64_BARRA',
    status: 'pending',
    attempts: 0,
    lastError: null,
    printedAt: null,
  }
}

let tenant: ITenant
let location: ILocation
let menuItemId: mongoose.Types.ObjectId
let kitchenPrinterId: mongoose.Types.ObjectId
let barraPrinterId: mongoose.Types.ObjectId
let seq = 0

async function makeOrder(overrides: Record<string, unknown> = {}) {
  seq += 1
  return Order.create({
    tenantId: tenant._id,
    locationId: location._id,
    orderNumber: `CSH-${seq}`,
    status: 'confirmed',
    orderMode: 'takeaway',
    items: [kitchenItem(), barItem()],
    subtotal: 8000,
    total: 8000,
    customer: { name: 'Cliente Efectivo' },
    payment: { method: 'cash', status: 'pending', baseTotal: 8000, surchargeAmount: 0 },
    kitchenPrintDeferred: false,
    printJobs: [],
    ...overrides,
  })
}

beforeEach(async () => {
  seq = 0
  menuItemId = new mongoose.Types.ObjectId()
  confirmOrderPaymentCoreMock.mockClear()

  tenant = await Tenant.create({
    name: 'Test Tenant',
    slug: SLUG,
    plan: 'full',
    status: 'active',
    pointsConfig: { welcomePoints: 100 },
    paymentSurcharges: { cash: { feePercent: 0 }, transfer: { feePercent: 0 }, mercadopago: { feePercent: 0 } },
  })

  location = await Location.create({
    tenantId: tenant._id,
    name: 'Sede Central',
    slug: 'sede-central',
    address: 'Av. Test 123',
    isActive: true,
  })

  await PlatformConfig.create({ _id: 'platform', maintenanceMode: false })

  await Menu.create({
    tenantId: tenant._id,
    locationId: location._id,
    categories: [{
      _id: new mongoose.Types.ObjectId(),
      name: 'Platos',
      items: [{
        _id: menuItemId,
        name: 'Milanesa',
        price: 5000,
        isEnabled: true,
      }],
    }],
  })

  const kitchenPrinter = await Printer.create({
    tenantId: tenant._id,
    locationId: location._id,
    uid: 'printer-kitchen',
    name: 'Impresora Cocina',
    ip: '192.168.1.50',
    isActive: true,
    roles: ['kitchen'],
  })
  kitchenPrinterId = kitchenPrinter._id

  const barraPrinter = await Printer.create({
    tenantId: tenant._id,
    locationId: location._id,
    uid: 'printer-barra',
    name: 'La Barra',
    ip: '192.168.1.51',
    isActive: true,
    roles: ['bar'],
  })
  barraPrinterId = barraPrinter._id
})

/* ══════════════════════════════════════════════════════════════════════════
   1. CREACIÓN — POST /orders con efectivo
   ══════════════════════════════════════════════════════════════════════════ */
describe('POST /orders — efectivo (checkout)', () => {
  function makeBody() {
    return {
      locationId: location._id.toString(),
      items: [
        {
          type: 'menuItem',
          menuItemId: menuItemId.toString(),
          quantity: 1,
          customizations: [],
        },
      ],
      customer: { name: 'Cliente Test', phone: '+5491111111111', email: 'test@test.com' },
      mode: 'takeaway',
      paymentMethod: 'cash',
    }
  }

  it('crea el pedido confirmed con el cobro PENDIENTE hasta delivered', async () => {
    // La impresora barra fue creada en el beforeEach — la sacamos para aislar
    // el assertion de pago.
    await Printer.deleteOne({ _id: barraPrinterId })

    const res = await createOrderPOST(createReq(makeBody()), createParams)
    expect(res.ok).toBe(true)

    const order = await Order.findOne({ tenantId: tenant._id }).lean()
    expect(order).toBeTruthy()
    expect(order!.status).toBe('confirmed')
    expect(order!.payment!.method).toBe('cash')
    expect(order!.payment!.status).toBe('pending')
    expect(order!.kitchenPrintDeferred).toBe(false)
  })

  it('con BARRA: el pedido sale SOLO en la barra (ticket forzado) y cocina queda diferido', async () => {
    const res = await createOrderPOST(createReq(makeBody()), createParams)
    expect(res.ok).toBe(true)

    const created = await Order.findOne({ tenantId: tenant._id })
    expect(created).toBeTruthy()

    // onOrderConfirmed corre fire-and-forget después del save del checkout.
    await waitFor(async () => {
      const fresh = await Order.findById(created!._id)
      return !!fresh?.kitchenPrintDeferred
    })

    const order = await Order.findById(created!._id).lean()
    expect(order!.kitchenPrintDeferred).toBe(true)
    expect(order!.printJobs!.length).toBeGreaterThan(0)
    for (const job of order!.printJobs!) {
      expect(job.printerId!.toString()).toBe(barraPrinterId.toString())
      expect(job.role).toBe('bar')
    }
    // Nunca le mandó nada a la cocina en la creación.
    expect(
      order!.printJobs!.some((j) => j.printerId!.toString() === kitchenPrinterId.toString())
    ).toBe(false)
    // Y el cobro sigue pendiente: la impresión no cobra.
    expect(order!.payment!.status).toBe('pending')
  })

  it('sin impresora BARRA: flujo histórico — imprime en todas, flag en false', async () => {
    await Printer.deleteOne({ _id: barraPrinterId })

    const res = await createOrderPOST(createReq(makeBody()), createParams)
    expect(res.ok).toBe(true)

    const created = await Order.findOne({ tenantId: tenant._id })
    await waitFor(async () => {
      const fresh = await Order.findById(created!._id)
      return !!fresh?.printJobs?.length
    })

    const order = await Order.findById(created!._id).lean()
    expect(order!.kitchenPrintDeferred).toBe(false)
    expect(
      order!.printJobs!.some((j) => j.printerId!.toString() === kitchenPrinterId.toString())
    ).toBe(true)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   2. onOrderConfirmed — pase barra-first (directo, control total de fixtures)
   ══════════════════════════════════════════════════════════════════════════ */
describe('onOrderConfirmed — pase BARRA-first para efectivo', () => {
  it('efectivo con items de barra: jobs solo en la BARRA, cocina diferido', async () => {
    const order = await makeOrder({ kitchenPrintDeferred: false, printJobs: [] })

    await onOrderConfirmed(order)
    await order.save()

    expect(order.kitchenPrintDeferred).toBe(true)
    expect(order.printJobs.length).toBe(1)
    expect(order.printJobs[0].printerId.toString()).toBe(barraPrinterId.toString())
    expect(order.printJobs[0].role).toBe('bar')
  })

  it('efectivo 100% comida: el rol normal no produce nada → ticket COMPLETO forzado en BARRA', async () => {
    const order = await makeOrder({
      items: [kitchenItem()],
      kitchenPrintDeferred: false,
      printJobs: [],
    })

    await onOrderConfirmed(order)
    await order.save()

    expect(order.kitchenPrintDeferred).toBe(true)
    // Un único job, para la barra, con el pedido entero.
    expect(order.printJobs.length).toBe(1)
    expect(order.printJobs[0].printerId.toString()).toBe(barraPrinterId.toString())
    expect(order.printJobs[0].role).toBe('bar')
    expect(order.printJobs[0].payload.length).toBeGreaterThan(0)
  })

  it('NO efectivo: imprime en barra Y cocina, sin diferir nada', async () => {
    const order = await makeOrder({
      payment: { method: 'transfer', status: 'pending', baseTotal: 8000, surchargeAmount: 0 },
      kitchenPrintDeferred: false,
      printJobs: [],
    })

    await onOrderConfirmed(order)
    await order.save()

    expect(order.kitchenPrintDeferred).toBe(false)
    const printerIds = order.printJobs.map((j) => j.printerId.toString())
    expect(printerIds).toContain(barraPrinterId.toString())
    expect(printerIds).toContain(kitchenPrinterId.toString())
  })

  it('efectivo sin impresora BARRA: flujo histórico (todas las impresoras)', async () => {
    await Printer.deleteOne({ _id: barraPrinterId })
    const order = await makeOrder({ kitchenPrintDeferred: false, printJobs: [] })

    await onOrderConfirmed(order)
    await order.save()

    expect(order.kitchenPrintDeferred).toBe(false)
    const printerIds = order.printJobs.map((j) => j.printerId.toString())
    expect(printerIds).toContain(kitchenPrinterId.toString())
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   3. PATCH status — modal del cajero al pasar a preparación
   ══════════════════════════════════════════════════════════════════════════ */
describe('PATCH status — confirmed → preparando (decisión de impresión)', () => {
  async function deferredOrder() {
    return makeOrder({
      status: 'confirmed',
      kitchenPrintDeferred: true,
      printJobs: [pendingJob(barraPrinterId, 'La Barra', 'bar')],
    })
  }

  it('printKitchen: true → genera la comanda en cocina, limpia el flag y NO cobra', async () => {
    const order = await deferredOrder()
    const res = await statusPATCH(statusReq(order._id.toString(), { status: 'preparing', printKitchen: true }), statusParams(order._id.toString()))
    expect(res.status).toBe(200)

    const after = await Order.findById(order._id).lean()
    expect(after!.status).toBe('preparing')
    expect(after!.kitchenPrintDeferred).toBe(false)
    expect(after!.payment!.status).toBe('pending')

    const kitchenJobs = after!.printJobs!.filter((j) => j.printerId.toString() === kitchenPrinterId.toString())
    expect(kitchenJobs).toHaveLength(1)
    expect(kitchenJobs[0].role).toBe('kitchen')
    // La barra no recibe nada nuevo: ya vio el pedido en la creación.
    const barraJobs = after!.printJobs!.filter((j) => j.printerId.toString() === barraPrinterId.toString())
    expect(barraJobs).toHaveLength(1)
  })

  it('printKitchen: false → pasa sin comanda en cocina, limpia el flag', async () => {
    const order = await deferredOrder()
    const res = await statusPATCH(statusReq(order._id.toString(), { status: 'preparing', printKitchen: false }), statusParams(order._id.toString()))
    expect(res.status).toBe(200)

    const after = await Order.findById(order._id).lean()
    expect(after!.status).toBe('preparing')
    expect(after!.kitchenPrintDeferred).toBe(false)
    expect(after!.payment!.status).toBe('pending')
    // Solo el job de la barra de la creación.
    expect(after!.printJobs!).toHaveLength(1)
    expect(
      after!.printJobs!.some((j) => j.printerId.toString() === kitchenPrinterId.toString())
    ).toBe(false)
  })

  it('sin printKitchen (ruta sin UI, ej. POS/internal): imprime en cocina por defecto', async () => {
    const order = await deferredOrder()
    const res = await statusPATCH(statusReq(order._id.toString(), { status: 'preparing' }), statusParams(order._id.toString()))
    expect(res.status).toBe(200)

    const after = await Order.findById(order._id).lean()
    expect(after!.kitchenPrintDeferred).toBe(false)
    expect(
      after!.printJobs!.some((j) => j.printerId.toString() === kitchenPrinterId.toString())
    ).toBe(true)
    expect(after!.payment!.status).toBe('pending')
  })

  it('preparando NO cobra: la salvaguarda pending→approved solo aplica en delivered', async () => {
    const order = await deferredOrder()
    await statusPATCH(statusReq(order._id.toString(), { status: 'preparing', printKitchen: true }), statusParams(order._id.toString()))
    await flush()

    const after = await Order.findById(order._id).lean()
    expect(after!.payment!.status).toBe('pending')
    expect(confirmOrderPaymentCoreMock).not.toHaveBeenCalled()
  })

  it('listo TAMPUCO cobra: preparando → ready sigue pendiente', async () => {
    const order = await makeOrder({ status: 'preparing', kitchenPrintDeferred: false, printJobs: [] })
    const res = await statusPATCH(statusReq(order._id.toString(), { status: 'ready' }), statusParams(order._id.toString()))
    expect(res.status).toBe(200)
    await flush()

    const after = await Order.findById(order._id).lean()
    expect(after!.payment!.status).toBe('pending')
    expect(confirmOrderPaymentCoreMock).not.toHaveBeenCalled()
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   4. PATCH status — delivered cobra + registra la venta en caja
   ══════════════════════════════════════════════════════════════════════════ */
describe('PATCH status — delivered (cobro en efectivo)', () => {
  it('ready + cash pending → delivered: pago approved y venta en caja registrada', async () => {
    const order = await makeOrder({ status: 'ready', kitchenPrintDeferred: false, printJobs: [] })
    const res = await statusPATCH(statusReq(order._id.toString(), { status: 'delivered' }), statusParams(order._id.toString()))
    expect(res.status).toBe(200)
    await flush()

    const after = await Order.findById(order._id).lean()
    expect(after!.payment!.status).toBe('approved')

    expect(confirmOrderPaymentCoreMock).toHaveBeenCalledTimes(1)
    const [orderArg, tenantArg] = confirmOrderPaymentCoreMock.mock.calls[0]
    expect(orderArg._id.toString()).toBe(order._id.toString())
    expect(tenantArg._id.toString()).toBe(tenant._id.toString())
  })

  it('pago ya approved (pedido de antes del fix): NO registra dos veces', async () => {
    const order = await makeOrder({
      status: 'ready',
      payment: { method: 'cash', status: 'approved', baseTotal: 8000, surchargeAmount: 0 },
      kitchenPrintDeferred: false,
      printJobs: [],
    })
    const res = await statusPATCH(statusReq(order._id.toString(), { status: 'delivered' }), statusParams(order._id.toString()))
    expect(res.status).toBe(200)
    await flush()

    const after = await Order.findById(order._id).lean()
    expect(after!.payment!.status).toBe('approved')
    expect(confirmOrderPaymentCoreMock).not.toHaveBeenCalled()
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   5. PATCH status — cancelación del admin
   ══════════════════════════════════════════════════════════════════════════ */
describe('PATCH status — cancelación de un pedido en efectivo', () => {
  it('confirmed + cash pending → cancelled: cobro cancelado, flag limpio, sin comanda nueva', async () => {
    const order = await makeOrder({
      status: 'confirmed',
      kitchenPrintDeferred: true,
      printJobs: [pendingJob(barraPrinterId, 'La Barra', 'bar')],
    })

    const res = await statusPATCH(statusReq(order._id.toString(), { status: 'cancelled' }), statusParams(order._id.toString()))
    expect(res.status).toBe(200)
    await flush()

    const after = await Order.findById(order._id).lean()
    expect(after!.status).toBe('cancelled')
    expect(after!.payment!.status).toBe('cancelled')
    expect(after!.kitchenPrintDeferred).toBe(false)
    // Nunca se mandó nada a la cocina y la venta tampoco se registró.
    expect(
      after!.printJobs!.some((j) => j.printerId.toString() === kitchenPrinterId.toString())
    ).toBe(false)
    expect(confirmOrderPaymentCoreMock).not.toHaveBeenCalled()
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   6. PATCH status — guard interno: el SyncLayer no resucita terminales
   ══════════════════════════════════════════════════════════════════════════ */
describe('PATCH status — guard interno (SyncLayer → SaaS)', () => {
  beforeAll(() => {
    process.env.SYNC_LAYER_SECRET = INTERNAL_SECRET
  })

  afterAll(() => {
    delete process.env.SYNC_LAYER_SECRET
  })

  it('cancelled → preparing: 409 y el pedido sigue cancelado (sin resurrección)', async () => {
    const order = await makeOrder({ status: 'cancelled', kitchenPrintDeferred: false, printJobs: [] })

    const res = await statusPATCH(
      internalStatusReq(order._id.toString(), { status: 'preparing' }),
      statusParams(order._id.toString())
    )
    expect(res.status).toBe(409)

    const after = await Order.findById(order._id).lean()
    expect(after!.status).toBe('cancelled')
  })

  it('delivered → ready: 409 (delivered también es terminal por la vía interna)', async () => {
    const order = await makeOrder({
      status: 'delivered',
      payment: { method: 'cash', status: 'approved', baseTotal: 8000, surchargeAmount: 0 },
      kitchenPrintDeferred: false,
      printJobs: [],
    })

    const res = await statusPATCH(
      internalStatusReq(order._id.toString(), { status: 'ready' }),
      statusParams(order._id.toString())
    )
    expect(res.status).toBe(409)

    const after = await Order.findById(order._id).lean()
    expect(after!.status).toBe('delivered')
    // Cobrar de nuevo sería venta fantasma: el pago no se toca.
    expect(after!.payment!.status).toBe('approved')
  })

  it('cancelled → cancelled: idempotente por la vía interna (200)', async () => {
    const order = await makeOrder({ status: 'cancelled', kitchenPrintDeferred: false, printJobs: [] })

    const res = await statusPATCH(
      internalStatusReq(order._id.toString(), { status: 'cancelled' }),
      statusParams(order._id.toString())
    )
    expect(res.status).toBe(200)

    const after = await Order.findById(order._id).lean()
    expect(after!.status).toBe('cancelled')
  })

  it('la vía externa (sin secreto) sigue rechazando por el grafo: 400', async () => {
    const order = await makeOrder({ status: 'cancelled', kitchenPrintDeferred: false, printJobs: [] })

    const res = await statusPATCH(
      statusReq(order._id.toString(), { status: 'preparing' }),
      statusParams(order._id.toString())
    )
    expect(res.status).toBe(400)

    const after = await Order.findById(order._id).lean()
    expect(after!.status).toBe('cancelled')
  })
})
