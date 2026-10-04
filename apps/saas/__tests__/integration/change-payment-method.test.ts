import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'
import PlatformConfig from '@/models/PlatformConfig'

/**
 * Evidencia de que el camino de efectivo NO está bifurcado.
 *
 * `confirmOrderPaymentCore` (venta en caja + CIS) solo puede alcanzarse a
 * través de `registerCashSaleOnDelivery` (lib/order-side-effects.ts) — y eso
 * recién cuando el pedido se ENTREGA. El aviso al admin a creación pasa por
 * `notifyCashOrderCreated`, que es el MISMO punto de entrada para el checkout
 * normal y el endpoint de emergencia. Estos tests mockean el módulo de
 * sync-layer y verifican ambas cosas, y un test de nivel fuente verifica que
 * nadie agregue una segunda implementación.
 */
const confirmOrderPaymentCoreMock = vi.fn().mockResolvedValue(undefined)
const notifySyncLayerStatusMock = vi.fn().mockResolvedValue(undefined)
const pushOrderToSyncLayerMock = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/sync-layer', () => ({
  confirmOrderPaymentCore: (...args: any[]) => confirmOrderPaymentCoreMock(...args),
  notifySyncLayerStatus: (...args: any[]) => notifySyncLayerStatusMock(...args),
  pushOrderToSyncLayer: (...args: any[]) => pushOrderToSyncLayerMock(...args),
}))

const adminPushMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/push', () => ({
  sendAdminPushNotification: (...args: any[]) => adminPushMock(...args),
}))

const onOrderConfirmedMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/printing', () => ({
  onOrderConfirmed: (...args: any[]) => onOrderConfirmedMock(...args),
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
import { GET as paymentOptions } from '@/app/api/[tenant]/orders/[orderId]/payment-options/route'

const SLUG = 'test-tenant'
const TRACKING_TOKEN = 'tok-change-999'
const MP_ACCOUNT_ID = '64b0000000000000000000b1'

function params(orderId?: string) {
  return {
    params: Promise.resolve({ tenant: SLUG, ...(orderId ? { orderId } : {}) }),
  }
}

function postReq(orderId: string, body: any, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost/api/${SLUG}/orders/${orderId}/change-payment-method`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }) as any
}

function getReq(orderId: string, headers: Record<string, string> = {}) {
  return new Request(
    `http://localhost/api/${SLUG}/orders/${orderId}/payment-options`,
    { headers }
  ) as any
}

let tenant: any
let location: any

async function makeStuckOrder(overrides: Record<string, any> = {}) {
  return Order.create({
    tenantId: tenant._id,
    locationId: location._id,
    orderNumber: `CHG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
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
    mpAccounts: [
      {
        _id: MP_ACCOUNT_ID,
        label: 'Cuenta MP',
        accessToken: 'enc:tok',
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

/** Los efectos de efectivo corren en setImmediate: hay que drenarlos. */
const flush = () => new Promise((r) => setImmediate(() => setImmediate(r)))

/* ══════════════════════════════════════════════════════════════════════════
   GUARDAS — el endpoint es público, no puede quedar abierto.
   ══════════════════════════════════════════════════════════════════════════ */
describe('change-payment-method — guardas', () => {
  it('sin tracking-token responde 401 y NO toca la orden', async () => {
    const order = await makeStuckOrder()
    const res = await changePaymentMethod(postReq(order._id.toString(), { method: 'cash' }), params(order._id.toString()))
    expect(res.status).toBe(401)
    const after = await Order.findById(order._id)
    expect(after!.status).toBe('awaiting_payment')
    expect(after!.payment.method).toBe('mercadopago')
  })

  it('con tracking-token incorrecto responde 403 y NO toca la orden', async () => {
    const order = await makeStuckOrder()
    const res = await changePaymentMethod(
      postReq(order._id.toString(), { method: 'cash' }, { 'x-tracking-token': 'ajeno' }),
      params(order._id.toString())
    )
    expect(res.status).toBe(403)
    expect((await Order.findById(order._id))!.payment.method).toBe('mercadopago')
  })

  it('no encuentra el pedido de otro tenant (404)', async () => {
    const order = await makeStuckOrder()
    const res = await changePaymentMethod(
      postReq(order._id.toString(), { method: 'cash' }, { 'x-tracking-token': TRACKING_TOKEN }),
      params('64b0000000000000000000ff')
    )
    expect(res.status).toBe(404)
    expect((await Order.findById(order._id))!.status).toBe('awaiting_payment')
  })

  it('rechaza un método desconocido (400)', async () => {
    const order = await makeStuckOrder()
    const res = await changePaymentMethod(
      postReq(order._id.toString(), { method: 'bitcoin' }, { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    expect(res.status).toBe(400)
    expect((await Order.findById(order._id))!.payment.method).toBe('mercadopago')
  })

  it('NO cambia el método si el pedido ya no está en awaiting_payment', async () => {
    const order = await makeStuckOrder({ status: 'preparing' })
    const res = await changePaymentMethod(
      postReq(order._id.toString(), { method: 'cash' }, { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    expect(res.status).toBe(400)
    const after = await Order.findById(order._id)
    expect(after!.status).toBe('preparing')
    expect(after!.payment.method).toBe('mercadopago')
  })

  it('NO cambia el método si la comisión ya se sumó al balance', async () => {
    const order = await makeStuckOrder({
      payment: {
        method: 'mercadopago',
        status: 'pending',
        baseTotal: 3000,
        commissionBalanceAdded: true,
      },
    })
    const res = await changePaymentMethod(
      postReq(order._id.toString(), { method: 'cash' }, { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    expect(res.status).toBe(400)
    expect((await Order.findById(order._id))!.payment.method).toBe('mercadopago')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   EFECTIVO — confirmed + pending (cobra contra entrega), sin bifurcación.
   ══════════════════════════════════════════════════════════════════════════ */
describe('change-payment-method → efectivo', () => {
  it('confirma el pedido al instante (confirmed) con el cobro pendiente hasta delivered', async () => {
    const order = await makeStuckOrder()
    const res = await changePaymentMethod(
      postReq(order._id.toString(), { method: 'cash' }, { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    expect(res.status).toBe(200)

    const after = await Order.findById(order._id)
    expect(after!.status).toBe('confirmed')
    expect(after!.payment.status).toBe('pending')
    expect(after!.payment.method).toBe('cash')
    expect(after!.statusTimestamps.confirmedAt).toBeTruthy()
  })

  it('NO registra la venta en caja al cambiarse: eso recién ocurre al ENTREGAR', async () => {
    const order = await makeStuckOrder()
    await changePaymentMethod(
      postReq(order._id.toString(), { method: 'cash' }, { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    await flush()

    expect(confirmOrderPaymentCoreMock).not.toHaveBeenCalled()
  })

  it('notifica al admin y dispara los print jobs, como el checkout normal', async () => {
    const order = await makeStuckOrder()
    await changePaymentMethod(
      postReq(order._id.toString(), { method: 'cash' }, { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    await flush()

    expect(adminPushMock).toHaveBeenCalledTimes(1)
    expect(onOrderConfirmedMock).toHaveBeenCalledTimes(1)
  })

  it('NO hace push de alta al POS (la orden ya existe): notifica el cambio de status', async () => {
    const order = await makeStuckOrder()
    await changePaymentMethod(
      postReq(order._id.toString(), { method: 'cash' }, { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    await flush()

    expect(pushOrderToSyncLayerMock).not.toHaveBeenCalled()
    expect(notifySyncLayerStatusMock).toHaveBeenCalledWith(
      tenant._id.toString(),
      order._id.toString(),
      'confirmed'
    )
  })

  it('el efectivo no tiene recargo: el total vuelve al baseTotal', async () => {
    const order = await makeStuckOrder()
    await changePaymentMethod(
      postReq(order._id.toString(), { method: 'cash' }, { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    const after = await Order.findById(order._id)
    expect(after!.total).toBe(3000)
    expect(after!.payment.baseTotal).toBe(3000)
    expect(after!.payment.surchargeAmount).toBe(0)
  })

  it('limpia la referencia de MP para que el tracking no auto-confirme', async () => {
    const order = await makeStuckOrder({
      payment: {
        method: 'mercadopago',
        status: 'pending',
        baseTotal: 3000,
        mercadopagoId: 'mp-preference-vieja',
      },
    })
    await changePaymentMethod(
      postReq(order._id.toString(), { method: 'cash' }, { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    const after = await Order.findById(order._id)
    expect(after!.payment.mercadopagoId).toBeFalsy()
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   TRANSFERENCIA / MP — siguen esperando pago, con el total recalculado.
   ══════════════════════════════════════════════════════════════════════════ */
describe('change-payment-method → transferencia / MP', () => {
  it('transferencia recalcula el total y sigue en awaiting_payment', async () => {
    const order = await makeStuckOrder()
    const res = await changePaymentMethod(
      postReq(order._id.toString(), { method: 'transfer' }, { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.requiresPreference).toBe(false)
    expect(body.transfer?.alias).toBe('alias.test')

    const after = await Order.findById(order._id)
    expect(after!.status).toBe('awaiting_payment')
    expect(after!.payment.status).toBe('pending')
    expect(after!.payment.method).toBe('transfer')
    // Takeaway no lleva recargo de transferencia.
    expect(after!.total).toBe(3000)
  })

  it('NO dispara efectos de caja al cambiar a un método que no es efectivo', async () => {
    const order = await makeStuckOrder()
    await changePaymentMethod(
      postReq(order._id.toString(), { method: 'transfer' }, { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    await flush()
    expect(confirmOrderPaymentCoreMock).not.toHaveBeenCalled()
    expect(onOrderConfirmedMock).not.toHaveBeenCalled()
  })

  it('MP avisa que necesita preferencia y recalcula el total con recargo', async () => {
    const order = await makeStuckOrder({
      payment: { method: 'transfer', status: 'pending', baseTotal: 3000 },
    })
    const res = await changePaymentMethod(
      postReq(order._id.toString(), { method: 'mercadopago' }, { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    const body = await res.json()
    expect(body.requiresPreference).toBe(true)

    const after = await Order.findById(order._id)
    expect(after!.payment.method).toBe('mercadopago')
    expect(after!.payment.baseTotal).toBe(3000)
    expect(after!.total).toBeGreaterThan(3000)
  })

  it('limpia referencias de Kripton y transferencia al cambiar de método', async () => {
    const order = await makeStuckOrder({
      payment: {
        method: 'kripton',
        status: 'pending',
        baseTotal: 3000,
        kriptonExternalCode: 'kr-123',
        kriptonToken: 'kr-123',
        kriptonData: { x: 1 },
        transferConfirmed: true,
      },
    })
    await changePaymentMethod(
      postReq(order._id.toString(), { method: 'transfer' }, { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    const after = await Order.findById(order._id)
    expect(after!.payment.kriptonExternalCode).toBeFalsy()
    expect(after!.payment.kriptonToken).toBeFalsy()
    expect(after!.payment.kriptonData).toBeFalsy()
  })

  // ── El caso que reintroduce el pedido varado ────────────────────────────
  // Reintentar MP sobre un pedido que YA tenía una preferencia vieja no cambia
  // el método, así que un `previousMethod !== method` lo dejaba pasar. Si el
  // `create-preference` de este reintento falla, la orden queda en
  // awaiting_payment con un mercadopagoId que nunca se cobró: exactamente el
  // pedido varado que este deliverable elimina.
  it('limpia la preferencia vieja al REINTENTAR el mismo método (MP → MP)', async () => {
    const order = await makeStuckOrder({
      payment: {
        method: 'mercadopago',
        status: 'pending',
        baseTotal: 3000,
        mercadopagoId: 'mp-preferencia-velle',
        mercadopagoData: { id: 'mp-preferencia-velle' },
        mpAccountId: 'mp-cuenta-del-tenant',
      },
    })

    const res = await changePaymentMethod(
      postReq(order._id.toString(), { method: 'mercadopago' }, { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.requiresPreference).toBe(true)

    const after = await Order.findById(order._id)
    expect(after!.payment.mercadopagoId).toBeNull()
    expect(after!.payment.mercadopagoData).toBeNull()
    // mpAccountId NO es una preferencia: es a qué cuenta se cobra. Se conserva.
    expect(after!.payment.mpAccountId).toBe('mp-cuenta-del-tenant')
  })

  it('limpia la referencia vieja al REINTENTAR Kripton (kripton → kripton)', async () => {
    // Kripton sólo entra al catálogo si la plataforma lo habilita, el tenant está
    // configurado y el tenant lo tiene visible (paymentMethodsVisibility.kripton
    // defaulta a false). Sin las tres, el endpoint responde 400 y el test
    // probaría otra cosa.
    await PlatformConfig.create({ _id: 'platform', kripton: { enabled: true } })
    await Tenant.updateOne(
      { _id: tenant._id },
      { $set: { kripton: { isConfigured: true }, 'paymentMethodsVisibility.kripton': true } }
    )

    const order = await makeStuckOrder({
      payment: {
        method: 'kripton',
        status: 'pending',
        baseTotal: 3000,
        kriptonExternalCode: 'kr-velle',
        kriptonToken: 'kr-velle',
        kriptonData: { code: 'kr-velle' },
      },
    })

    await changePaymentMethod(
      postReq(order._id.toString(), { method: 'kripton' }, { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )

    const after = await Order.findById(order._id)
    expect(after!.payment.kriptonExternalCode).toBeNull()
    expect(after!.payment.kriptonToken).toBeNull()
    expect(after!.payment.kriptonData).toBeNull()
  })

  it('tras limpiar, la orden queda coherente: awaiting_payment y sin total de MP', async () => {
    const order = await makeStuckOrder({
      payment: {
        method: 'mercadopago',
        status: 'pending',
        baseTotal: 3000,
        mercadopagoId: 'mp-velle',
        mercadopagoData: { id: 'mp-velle' },
      },
    })

    await changePaymentMethod(
      postReq(order._id.toString(), { method: 'mercadopago' }, { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )

    const after = await Order.findById(order._id)
    expect(after!.status).toBe('awaiting_payment')
    expect(after!.payment.status).toBe('pending')
    // Sin preferencia no puede haber monto de la preferencia persistido.
    expect(after!.payment.mercadopagoId).toBeNull()
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   COTIZACIÓN — el server calcula, el cliente no multiplica nada.
   ══════════════════════════════════════════════════════════════════════════ */
describe('payment-options — cotización server-side', () => {
  it('exige tracking-token', async () => {
    const order = await makeStuckOrder()
    const res = await paymentOptions(getReq(order._id.toString()), params(order._id.toString()))
    expect(res.status).toBe(401)
  })

  it('con tracking-token incorrecto responde 403', async () => {
    const order = await makeStuckOrder()
    const res = await paymentOptions(
      getReq(order._id.toString(), { 'x-tracking-token': 'token-ajeno' }),
      params(order._id.toString())
    )
    expect(res.status).toBe(403)
  })

  it('no cotiza un pedido que ya no está esperando pago', async () => {
    // Cotizar solo alimenta el panel de emergencia: sobre un pedido confirmado
    // mostraría precios que ya no aplican.
    const order = await makeStuckOrder({ status: 'confirmed' })
    const res = await paymentOptions(
      getReq(order._id.toString(), { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    expect(res.status).toBe(400)
  })

  it('no filtra la configuración de un pedido de otro tenant', async () => {
    // El token es del tenant A: aunque sea correcto, el pedido es del tenant B.
    const order = await makeStuckOrder()
    const res = await paymentOptions(
      getReq(order._id.toString(), { 'x-tracking-token': TRACKING_TOKEN }),
      { params: Promise.resolve({ tenant: 'otro-tenant', orderId: order._id.toString() }) }
    )
    expect(res.status).toBe(404)
  })

  it('devuelve el total y el delta de cada método contra el total actual', async () => {
    const order = await makeStuckOrder()
    const res = await paymentOptions(
      getReq(order._id.toString(), { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.currentMethod).toBe('mercadopago')
    expect(body.currentTotal).toBe(3300)
    expect(body.baseTotal).toBe(3000)

    const cash = body.options.find((o: any) => o.id === 'cash')
    const mp = body.options.find((o: any) => o.id === 'mercadopago')
    const transfer = body.options.find((o: any) => o.id === 'transfer')

    // Efectivo: sin recargo → total = baseTotal, delta negativo frente al MP actual.
    expect(cash.total).toBe(3000)
    expect(cash.delta).toBe(3000 - 3300)
    // Transferencia en takeaway tampoco lleva recargo.
    expect(transfer.total).toBe(3000)
    // El método actual queda marcado como tal.
    expect(mp.isCurrent).toBe(true)
    expect(cash.isCurrent).toBe(false)
  })

  it('los deltas cuadran con los totales que devuelve', async () => {
    const order = await makeStuckOrder()
    const res = await paymentOptions(
      getReq(order._id.toString(), { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    const body = await res.json()
    for (const opt of body.options) {
      expect(opt.delta).toBe(opt.total - body.currentTotal)
    }
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   LOS DESCUENTOS NO SE PIENDEN AL CAMBIAR DE MÉTODO
   ──────────────────────────────────────────────────────────────────────────
   `baseTotal` es el monto ya descontado (categoría + QR + promos) pero SIN el
   recargo del método de pago. Cambiar de método tiene que reprocesar desde ahí:
   si partiera del total actual, el descuento se aplicaría dos veces y el
   cliente pagaría de más sin darse cuenta.
   ══════════════════════════════════════════════════════════════════════════ */
describe('cambio de método — los descuentos aplicados se conservan', () => {
  it('de efectivo vuelve exactamente al baseTotal, sin recargar el descuento', async () => {
    const order = await makeStuckOrder({
      subtotal: 10000,
      discountAmount: 1500,
      qrPromoApplied: true,
      total: 9350, // 8500 de baseTotal + 10% de recargo MP
      payment: {
        method: 'mercadopago',
        status: 'pending',
        baseTotal: 8500,
        surchargePercent: 10,
        surchargeAmount: 850,
      },
    })

    const res = await changePaymentMethod(
      postReq(order._id.toString(), { method: 'cash' }, { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    expect(res.status).toBe(200)

    const after = await Order.findById(order._id)
    // Sin recargo: el total es el baseTotal, ni el total con MP (9350) ni el
    // baseTotal con el descuento aplicado otra vez (7650).
    expect(after!.total).toBe(8500)
    expect(after!.payment.baseTotal).toBe(8500)
    expect(after!.payment.surchargeAmount).toBe(0)
    // El descuento sigue registrado en la orden: no se borró para "arreglar" el total.
    expect(after!.discountAmount).toBe(1500)
    expect(after!.qrPromoApplied).toBe(true)
  })

  it('al cotizar, el precio de efectivo parte del baseTotal descontado', async () => {
    const order = await makeStuckOrder({
      subtotal: 10000,
      discountAmount: 1500,
      qrPromoApplied: true,
      total: 9350,
      payment: {
        method: 'mercadopago',
        status: 'pending',
        baseTotal: 8500,
        surchargePercent: 10,
        surchargeAmount: 850,
      },
    })

    const res = await paymentOptions(
      getReq(order._id.toString(), { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    const body = await res.json()
    const cash = body.options.find((o: any) => o.id === 'cash')
    expect(body.baseTotal).toBe(8500)
    expect(cash.total).toBe(8500)
    // Pagar 1350 menos que con MercadoPago, no 850 menos: el delta se mide
    // contra el total real que el cliente ya estaba por pagar.
    expect(cash.delta).toBe(8500 - 9350)
  })

  it('un pedido creado en efectivo conserva su baseTotal al volver a cotizar', async () => {
    // El `baseTotal` de un pedido en efectivo ya tiene el descuento de efectivo
    // del tenant descontado (orders/route.ts lo resta antes de cotizar). Cambiar
    // de método NO lo vuelve a aplicar: el reprocessing parte de ese monto y solo
    // recalcula el recargo del método destino.
    const order = await makeStuckOrder({
      subtotal: 10000,
      discountAmount: 500,
      total: 10000,
      payment: {
        method: 'cash',
        status: 'approved',
        baseTotal: 9500,
        surchargeAmount: 0,
      },
    })

    const res = await changePaymentMethod(
      postReq(order._id.toString(), { method: 'transfer' }, { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    expect(res.status).toBe(200)

    const after = await Order.findById(order._id)
    // No se descuenta el 5% otra vez: 9500, no 9025.
    expect(after!.payment.baseTotal).toBe(9500)
    expect(after!.payment.method).toBe('transfer')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   NO BIFURCACIÓN — a nivel de código fuente.
   Un cambio futuro que agremente una segunda implementación de efectivo
   rompe este test.
   ══════════════════════════════════════════════════════════════════════════ */
describe('El camino de efectivo no está bifurcado', () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

  it('el checkout normal avisa al admin vía notifyCashOrderCreated, sin confirmOrderPaymentCore directo', () => {
    const src = read('app/api/[tenant]/orders/route.ts')
    expect(src).toContain("from '@/lib/order-side-effects'")
    expect(src).toContain('notifyCashOrderCreated(')
    // La llamada directa a la función interna queda prohibida acá.
    expect(src).not.toMatch(/await confirmOrderPaymentCore\(/)
    // La venta en caja no se registra a creación — solo al entregar.
    expect(src).not.toMatch(/registerCashSaleOnDelivery\(/)
  })

  it('el flujo de emergencia llama al MISMO notifyCashOrderCreated', () => {
    const src = read('app/api/[tenant]/orders/[orderId]/change-payment-method/route.ts')
    expect(src).toContain("from '@/lib/order-side-effects'")
    expect(src).toContain('notifyCashOrderCreated(')
    expect(src).not.toMatch(/await confirmOrderPaymentCore\(/)
    expect(src).not.toMatch(/registerCashSaleOnDelivery\(/)
  })

  it('registerCashSaleOnDelivery es el único lugar que llama a confirmOrderPaymentCore', () => {
    const src = read('lib/order-side-effects.ts')
    const calls = src.match(/await confirmOrderPaymentCore\(/g) || []
    expect(calls).toHaveLength(1)
  })
})