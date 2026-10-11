import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'
import LoyaltyMember from '@/models/LoyaltyMember'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/whatsapp', () => ({
  sendWhatsApp: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/push', () => ({
  sendAdminPushNotification: vi.fn().mockResolvedValue(undefined),
}))

const onOrderConfirmedMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/printing', () => ({
  onOrderConfirmed: (...args: any[]) => onOrderConfirmedMock(...args),
}))

const createTripMock = vi.fn()
vi.mock('@/lib/rapiboy/client', () => ({
  crearViajeOnDemand: (...args: any[]) => createTripMock(...args),
}))

// verifyMemberToken controlable por test
let memberTokenResult: any = { valid: false, reason: 'unset' }
vi.mock('@/lib/memberToken', () => ({
  verifyMemberToken: vi.fn(async () => memberTokenResult),
}))

// getSessionUser controlable por test (flujo app logueado)
let sessionUser: any = null
vi.mock('@/lib/apiAuth', () => ({
  getSessionUser: vi.fn(async () => sessionUser),
}))

import { PATCH as pickup } from '@/app/api/[tenant]/orders/[orderId]/pickup/route'
import { PATCH as confirmTransferClient } from '@/app/api/[tenant]/orders/[orderId]/confirm-transfer-client/route'
import { GET as rapiboyGet, POST as rapiboyPost } from '@/app/api/[tenant]/orders/[orderId]/rapiboy-price-accept/route'
import { POST as redeemPost, GET as redeemGet } from '@/app/api/[tenant]/store/redemptions/route'
import StoreItem from '@/models/StoreItem'
import { rateLimit } from '@/lib/rateLimit'

const SLUG = 'test-tenant'
const TOKEN = 'tok-abc-123'

function req(url: string, method: string, headers: Record<string, string> = {}) {
  return new Request(url, { method, headers }) as any
}

function orderParams(orderId: string) {
  return { params: Promise.resolve({ tenant: SLUG, orderId }) }
}

function tenantParams() {
  return { params: Promise.resolve({ tenant: SLUG }) }
}

let tenant: any
let location: any

async function makeOrder(overrides: Record<string, any> = {}) {
  return Order.create({
    tenantId: tenant._id,
    locationId: location._id,
    orderNumber: `TST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    status: 'ready',
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
    payment: { method: 'cash', status: 'pending', baseTotal: 3000 },
    trackingToken: TOKEN,
    ...overrides,
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  memberTokenResult = { valid: false, reason: 'unset' }
  sessionUser = null
  onOrderConfirmedMock.mockResolvedValue(undefined)
  vi.mocked(rateLimit).mockResolvedValue({ success: true, remaining: 0 })

  tenant = await Tenant.create({
    name: 'Tenant',
    slug: SLUG,
    plan: 'full',
    status: 'active',
    isActive: true,
    store: { enabled: true },
  })
  location = await Location.create({
    tenantId: tenant._id,
    name: 'Centro',
    slug: 'centro',
    address: 'Av. Siempreviva 742',
    rapiboyConfig: {
      enabled: true,
      apiToken: 'tok-rapiboy',
      environment: 'uat',
      codigoPlataforma: 'TEST',
    },
  })
})

describe('pickup — exige x-tracking-token', () => {
  it('401 sin token y la orden sigue en ready', async () => {
    const order = await makeOrder()
    const res = await pickup(req(`http://x/api/${SLUG}/orders/${order._id}/pickup`, 'PATCH'), orderParams(order._id.toString()))
    expect(res.status).toBe(401)
    expect((await Order.findById(order._id))!.status).toBe('ready')
  })

  it('403 con token incorrecto', async () => {
    const order = await makeOrder()
    const res = await pickup(
      req(`http://x/api/${SLUG}/orders/${order._id}/pickup`, 'PATCH', { 'x-tracking-token': 'otro' }),
      orderParams(order._id.toString())
    )
    expect(res.status).toBe(403)
    expect((await Order.findById(order._id))!.status).toBe('ready')
  })

  it('concreta el cobro en efectivo con el token correcto', async () => {
    const order = await makeOrder()
    const res = await pickup(
      req(`http://x/api/${SLUG}/orders/${order._id}/pickup`, 'PATCH', { 'x-tracking-token': TOKEN }),
      orderParams(order._id.toString())
    )
    expect(res.status).toBe(200)
    const fresh = await Order.findById(order._id)
    expect(fresh!.status).toBe('delivered')
    expect(fresh!.payment.status).toBe('approved')
  })
})

describe('confirm-transfer-client — exige x-tracking-token', () => {
  it('401 sin token', async () => {
    const order = await makeOrder({
      status: 'awaiting_payment',
      payment: { method: 'transfer', status: 'pending', baseTotal: 3000 },
    })
    const res = await confirmTransferClient(
      req(`http://x/api/${SLUG}/orders/${order._id}/confirm-transfer-client`, 'PATCH'),
      orderParams(order._id.toString())
    )
    expect(res.status).toBe(401)
    expect((await Order.findById(order._id))!.status).toBe('awaiting_payment')
  })

  it('403 con token incorrecto', async () => {
    const order = await makeOrder({
      status: 'awaiting_payment',
      payment: { method: 'transfer', status: 'pending', baseTotal: 3000 },
    })
    const res = await confirmTransferClient(
      req(`http://x/api/${SLUG}/orders/${order._id}/confirm-transfer-client`, 'PATCH', { 'x-tracking-token': 'otro' }),
      orderParams(order._id.toString())
    )
    expect(res.status).toBe(403)
  })

  it('marca awaiting_confirmation con el token correcto', async () => {
    const order = await makeOrder({
      status: 'awaiting_payment',
      payment: { method: 'transfer', status: 'pending', baseTotal: 3000 },
    })
    const res = await confirmTransferClient(
      req(`http://x/api/${SLUG}/orders/${order._id}/confirm-transfer-client`, 'PATCH', { 'x-tracking-token': TOKEN }),
      orderParams(order._id.toString())
    )
    expect(res.status).toBe(200)
    expect((await Order.findById(order._id))!.status).toBe('awaiting_confirmation')
  })
})

describe('rapiboy-price-accept — exige x-tracking-token (GET y POST)', () => {
  it('GET 401 sin token', async () => {
    const order = await makeOrder()
    const res = await rapiboyGet(
      req(`http://x/api/${SLUG}/orders/${order._id}/rapiboy-price-accept`, 'GET'),
      orderParams(order._id.toString())
    )
    expect(res.status).toBe(401)
  })

  it('POST 403 con token incorrecto', async () => {
    const order = await makeOrder()
    const res = await rapiboyPost(
      new Request(`http://x/api/${SLUG}/orders/${order._id}/rapiboy-price-accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tracking-token': 'otro' },
        body: JSON.stringify({ action: 'reject' }),
      }) as any,
      orderParams(order._id.toString())
    )
    expect(res.status).toBe(403)
    expect(createTripMock).not.toHaveBeenCalled()
  })

  it('POST acepta la cotización con el token correcto', async () => {
    const order = await makeOrder()
    order.deliveryProvider = {
      rapiboy: {
        quoteStatus: 'pending_customer_accept',
        pendingQuoteCost: 5500,
        checkoutCost: 5000,
        pendingQuoteTimestamp: new Date(),
      },
    }
    order.deliveryAddress = {
      street: 'Calle Falsa', number: '123', city: 'CABA',
      coordinates: { lat: -34.6, lng: -58.4 },
    }
    await order.save()

    createTripMock.mockResolvedValue({ tripId: 'viaje-1', trackingId: 'tr-1', trackingUrl: 'https://x/tr' })

    const res = await rapiboyPost(
      new Request(`http://x/api/${SLUG}/orders/${order._id}/rapiboy-price-accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tracking-token': TOKEN },
        body: JSON.stringify({ action: 'accept' }),
      }) as any,
      orderParams(order._id.toString())
    )
    expect(res.status).toBe(200)
    const fresh = await Order.findById(order._id)
    expect(fresh!.deliveryProvider!.rapiboy!.quoteStatus).toBe('accepted')
    expect(fresh!.deliveryProvider!.rapiboy!.tripId).toBe('viaje-1')
    expect(createTripMock).toHaveBeenCalledTimes(1)
  })
})

describe('store/redemptions — identidad por x-member-token o sesión', () => {
  const MEMBER_ID = new mongoose.Types.ObjectId().toString()
  const OTHER_TENANT_ID = new mongoose.Types.ObjectId().toString()

  it('POST 401 sin token aunque el body mande un memberId ajeno', async () => {
    const res = await redeemPost(
      new Request(`http://x/api/${SLUG}/store/redemptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeItemId: new mongoose.Types.ObjectId().toString(), memberId: MEMBER_ID }),
      }) as any,
      tenantParams()
    )
    expect(res.status).toBe(401)
  })

  it('POST 403 con member token de otro tenant', async () => {
    memberTokenResult = {
      valid: true,
      payload: { memberId: MEMBER_ID, tenantId: OTHER_TENANT_ID, version: 1 },
    }
    const res = await redeemPost(
      new Request(`http://x/api/${SLUG}/store/redemptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-member-token': 'jwt' },
        body: JSON.stringify({ storeItemId: new mongoose.Types.ObjectId().toString() }),
      }) as any,
      tenantParams()
    )
    expect(res.status).toBe(403)
  })

  it('GET 401 sin token y sin sesión', async () => {
    const res = await redeemGet(
      req(`http://x/api/${SLUG}/store/redemptions?memberId=${MEMBER_ID}`, 'GET'),
      tenantParams()
    )
    expect(res.status).toBe(401)
  })

  it('GET lista solo los canjes del miembro del token (ignora memberId del query)', async () => {
    const memberToken = await LoyaltyMember.create({
      tenantId: tenant._id,
      name: 'Token Member',
      phone: '+5491122223333',
      status: 'active',
      loyalty: { points: 100 },
    })
    const victim = await LoyaltyMember.create({
      tenantId: tenant._id,
      name: 'Victim Member',
      phone: '+5491144445555',
      status: 'active',
      loyalty: { points: 500 },
    })
    const item = await StoreItem.create({
      tenantId: tenant._id,
      name: 'Chopp',
      category: 'drink',
      description: 'Chopp de 500ml',
      imageUrl: 'https://x/chopp.png',
      pointsCost: 100,
      cashValue: 2000,
      isActive: true,
    })
    const { default: StoreRedemption } = await import('@/models/StoreRedemption')
    await StoreRedemption.create({
      tenantId: tenant._id, memberId: memberToken._id, storeItemId: item._id,
      pointsUsed: 100, status: 'pending', expiresAt: new Date(Date.now() + 3600_000),
    })
    await StoreRedemption.create({
      tenantId: tenant._id, memberId: victim._id, storeItemId: item._id,
      pointsUsed: 100, status: 'pending', expiresAt: new Date(Date.now() + 3600_000),
    })

    memberTokenResult = {
      valid: true,
      payload: { memberId: memberToken._id.toString(), tenantId: tenant._id.toString(), version: 1 },
    }

    // El query manda el memberId de la víctima: debe ignorarse.
    const res = await redeemGet(
      req(`http://x/api/${SLUG}/store/redemptions?memberId=${victim._id}`, 'GET', { 'x-member-token': 'jwt' }),
      tenantParams()
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.redemptions).toHaveLength(1)
    expect(data.redemptions[0].memberId).toBe(String(memberToken._id))
  })

  it('POST con sesión NextAuth resuelve el member por userId (flujo app)', async () => {
    const linked = await LoyaltyMember.create({
      tenantId: tenant._id,
      name: 'App Member',
      phone: '+5491166667777',
      status: 'active',
      userId: new mongoose.Types.ObjectId(),
      loyalty: { points: 300 },
    })
    sessionUser = { id: String(linked.userId), role: 'user', tenantId: tenant._id.toString() }

    const item = await StoreItem.create({
      tenantId: tenant._id,
      name: 'Cookie',
      category: 'food',
      description: 'Cookie de chocolate',
      imageUrl: 'https://x/cookie.png',
      pointsCost: 100,
      cashValue: 1500,
      isActive: true,
    })

    // Con sesión pero sin transacción disponible en standalone el POST falla
    // más abajo; el punto del test es que la identidad se resuelve por sesión
    // y no devuelve 401.
    const res = await redeemPost(
      new Request(`http://x/api/${SLUG}/store/redemptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeItemId: item._id.toString() }),
      }) as any,
      tenantParams()
    )
    // 401 = no resolvió identidad; 500 = resolvió pero la transacción no existe en standalone
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })
})
