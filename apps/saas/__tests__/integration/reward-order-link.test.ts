import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import StoreItem from '@/models/StoreItem'
import StoreRedemption from '@/models/StoreRedemption'
import Order from '@/models/Order'
import Location from '@/models/Location'
import PlatformConfig from '@/models/PlatformConfig'
import Menu from '@/models/Menu'
import { revertRewardRedemptions } from '@/lib/loyalty'
import { hashPhone } from '@/lib/crypto'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/crypto', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/crypto')>()
  return {
    ...orig,
    encrypt: vi.fn((text: string) => `encrypted:${text}`),
    safeDecrypt: vi.fn((text: string) => (text || '').replace(/^encrypted:/, '')),
  }
})

vi.mock('@/lib/consumer', () => ({
  upsertConsumerFromOrder: vi.fn().mockResolvedValue(undefined),
  upsertConsumerFromLoyaltyMember: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/push', () => ({
  sendAdminPushNotification: vi.fn().mockResolvedValue(undefined),
  sendAdminRedemptionPushNotification: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/sync-layer', () => ({
  pushOrderToSyncLayer: vi.fn().mockResolvedValue(undefined),
  confirmOrderPaymentCore: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/whatsapp', () => ({ sendWhatsApp: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/whatsapp-message', () => ({ buildOrderWhatsAppMessage: vi.fn().mockReturnValue('') }))
vi.mock('@/lib/impact', () => ({ registerImpactEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/hidden-rewards', () => ({ getDeviceIdIfExists: vi.fn().mockReturnValue(null) }))
vi.mock('@/lib/corporateAccess', () => ({ corporateHasAccess: vi.fn().mockResolvedValue(false) }))
vi.mock('@/lib/pricing', () => ({
  calculateFinalTotal: vi.fn().mockReturnValue({
    finalTotal: 10000,
    baseTotal: 10000,
    surchargeAmount: 0,
    surchargePercent: 0,
    platformFeeAmount: 0,
  }),
}))
vi.mock('@/lib/cash', () => ({ resolveCashConfig: vi.fn().mockReturnValue({ discountPercent: 0 }) }))
vi.mock('@/lib/geocode', () => ({ calculateDeliveryCost: vi.fn().mockResolvedValue(0) }))
vi.mock('@/lib/scheduled-orders', () => ({ validateScheduledPickupTime: vi.fn().mockReturnValue({ valid: true }) }))
vi.mock('@/lib/availability', () => ({ isServiceOpen: vi.fn().mockReturnValue(true) }))
vi.mock('@/lib/plans', () => ({
  canAccess: vi.fn().mockReturnValue(true),
  LOYALTY_MEMBER_LIMIT: { full: 10000 },
}))
vi.mock('@/lib/orderNumber', () => ({ generateOrderNumber: vi.fn().mockReturnValue('ORD-001') }))
vi.mock('web-push', () => {
  const mock = { setVapidDetails: vi.fn(), sendNotification: vi.fn() }
  return { __esModule: true, default: mock, setVapidDetails: vi.fn(), sendNotification: vi.fn() }
})
vi.mock('@takeasygo/business', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@takeasygo/business')>()
  return {
    ...orig,
    resolveHalfPriceCustomizations: vi.fn().mockReturnValue([]),
  }
})

// El cron lee CRON_SECRET al cargar el módulo: hay que setearlo antes del import dinámico.
process.env.CRON_SECRET = 'test-cron-secret'

const SLUG = 'reward-tenant'
const PHONE = '+5491122223333'

let tenant: any
let location: any
let member: any
let item: any

async function makeTenant(overrides: Record<string, any> = {}) {
  return Tenant.create({
    name: 'Reward Tenant',
    slug: SLUG,
    plan: 'full',
    status: 'active',
    isActive: true,
    store: { enabled: true, enableCheckoutRedemption: true, redemptionExpiryHours: 24 },
    ...overrides,
  })
}

async function makeMember(points = 500) {
  return LoyaltyMember.create({
    tenantId: tenant._id,
    name: 'María',
    phone: PHONE,
    phoneHash: hashPhone(PHONE),
    email: 'maria@test.com',
    status: 'active',
    loyalty: { points },
  })
}

async function makeItem(overrides: Record<string, any> = {}) {
  return StoreItem.create({
    tenantId: tenant._id,
    name: 'Cachapa',
    category: 'food',
    description: 'Deliciosa cachapa',
    imageUrl: 'https://example.com/cachapa.jpg',
    pointsCost: 100,
    cashValue: 2000,
    isActive: true,
    stock: 5,
    ...overrides,
  })
}

/** Simula el estado de una orden creada por el checkout con premio. */
async function makeOrderWithReward(overrides: Record<string, any> = {}) {
  return Order.create({
    tenantId: tenant._id,
    locationId: location._id,
    orderNumber: `ORD-${Date.now().toString(36)}`,
    orderMode: 'takeaway',
    status: 'awaiting_payment',
    customer: { name: 'María', phone: PHONE, phoneHash: hashPhone(PHONE) },
    payment: { status: 'pending', method: 'mercadopago' },
    items: [{
      menuItemId: null,
      storeItemId: item._id,
      itemType: 'reward',
      name: item.name,
      price: 0,
      basePrice: 0,
      quantity: 1,
      subtotal: 0,
    }],
    rewardItems: [{
      storeItemId: item._id,
      storeItemName: item.name,
      pointsCost: item.pointsCost,
      cashValue: item.cashValue,
    }],
    subtotal: 0,
    discountAmount: 0,
    total: 0,
    ...overrides,
  })
}

/** Crea el canje como lo haría el checkout (vinculado) y descuenta stock. */
async function makeCheckoutRedemption(order: any) {
  const red = await StoreRedemption.create({
    tenantId: tenant._id,
    memberId: member._id,
    storeItemId: item._id,
    pointsUsed: item.pointsCost,
    cashValue: item.cashValue,
    status: 'pending',
    source: 'checkout',
    orderId: order._id,
    locationId: location._id,
  })
  await StoreItem.updateOne({ _id: item._id }, { $inc: { stock: -1, totalRedemptions: 1 } })
  return red
}

beforeEach(async () => {
  tenant = await makeTenant()
  location = await Location.create({
    tenantId: tenant._id,
    name: 'Local',
    slug: 'local',
    address: 'Test 123',
    isActive: true,
  })
  member = await makeMember(500)
  item = await makeItem()
})

describe('Modelo StoreRedemption — fuente y expiración', () => {
  it('el canje de checkout NO expira (vive con el pedido pendiente)', async () => {
    const order = await makeOrderWithReward()
    const red = await makeCheckoutRedemption(order)

    expect(red.source).toBe('checkout')
    expect(String(red.orderId)).toBe(String(order._id))
    expect(red.expiresAt).toBeNull()
    expect(red.redemptionCode).toBeTruthy()
  })

  it('el canje standalone sí expira (redemptionExpiryHours / default 24h)', async () => {
    const red = await StoreRedemption.create({
      tenantId: tenant._id,
      memberId: member._id,
      storeItemId: item._id,
      pointsUsed: 100,
      status: 'pending',
      source: 'standalone',
    })

    expect(red.source).toBe('standalone')
    expect(red.orderId).toBeNull()
    expect(red.expiresAt).toBeTruthy()
    expect(red.expiresAt!.getTime()).toBeGreaterThan(Date.now())
  })

  it('un canje standalone respeta el expiresAt calculado por tenant', async () => {
    const expiresAt = new Date(Date.now() + 48 * 3600 * 1000)
    const red = await StoreRedemption.create({
      tenantId: tenant._id,
      memberId: member._id,
      storeItemId: item._id,
      pointsUsed: 100,
      status: 'pending',
      source: 'standalone',
      expiresAt,
    })
    expect(red.expiresAt!.toISOString()).toBe(expiresAt.toISOString())
  })
})

describe('revertRewardRedemptions', () => {
  it('cancela el canje vinculado, restaura stock y devuelve puntos si ya se descontaron', async () => {
    const order = await makeOrderWithReward({ rewardDeductionProcessed: true })
    await makeCheckoutRedemption(order)

    // El pago se acreditó: los puntos ya salieron
    await LoyaltyMember.updateOne({ _id: member._id }, { $inc: { 'loyalty.points': -100 } })

    await revertRewardRedemptions(order, tenant)

    const red = await StoreRedemption.findOne({ orderId: order._id })
    expect(red!.status).toBe('cancelled')

    const freshItem = await StoreItem.findById(item._id)
    expect(freshItem!.stock).toBe(5)
    expect(freshItem!.totalRedemptions).toBe(0)

    const freshMember = await LoyaltyMember.findById(member._id)
    expect(freshMember!.loyalty.points).toBe(500)

    const freshOrder = await Order.findById(order._id)
    expect(freshOrder!.rewardDeductionProcessed).toBe(false)
  })

  it('si los puntos aún no se descontaron, solo cancela el canje y restaura stock', async () => {
    const order = await makeOrderWithReward()
    await makeCheckoutRedemption(order)

    await revertRewardRedemptions(order, tenant)

    const red = await StoreRedemption.findOne({ orderId: order._id })
    expect(red!.status).toBe('cancelled')
    const freshItem = await StoreItem.findById(item._id)
    expect(freshItem!.stock).toBe(5)
    const freshMember = await LoyaltyMember.findById(member._id)
    expect(freshMember!.loyalty.points).toBe(500)
  })

  it('NO cancela un canje standalone independiente del mismo miembro y premio', async () => {
    const order = await makeOrderWithReward()
    // Canje standalone hecho una hora antes: no pertenece a este pedido
    const standalone = await StoreRedemption.create({
      tenantId: tenant._id,
      memberId: member._id,
      storeItemId: item._id,
      pointsUsed: 100,
      status: 'pending',
      source: 'standalone',
    })
    await StoreRedemption.collection.updateOne(
      { _id: standalone._id },
      { $set: { createdAt: new Date(Date.now() - 60 * 60 * 1000) } }
    )

    await revertRewardRedemptions(order, tenant)

    const fresh = await StoreRedemption.findById(standalone._id)
    expect(fresh!.status).toBe('pending')
  })

  it('cancela canjes LEGACY (sin orderId) creados dentro de la ventana del pedido', async () => {
    const order = await makeOrderWithReward()
    const legacy = await StoreRedemption.create({
      tenantId: tenant._id,
      memberId: member._id,
      storeItemId: item._id,
      pointsUsed: 100,
      status: 'pending',
      // sin source → default standalone, sin orderId → camino legacy
    })

    await revertRewardRedemptions(order, tenant)

    const fresh = await StoreRedemption.findById(legacy._id)
    expect(fresh!.status).toBe('cancelled')
  })
})

describe('Cron cancel-awaiting-payment', () => {
  it('cancela órdenes awaiting_payment antiguas y revierte sus canjes', async () => {
    const { GET: cancelCron } = await import('@/app/api/cron/cancel-awaiting-payment/route')

    const order = await makeOrderWithReward()
    await makeCheckoutRedemption(order)
    await Order.collection.updateOne(
      { _id: order._id },
      { $set: { createdAt: new Date(Date.now() - 10 * 3600 * 1000) } }
    )

    const res = await cancelCron(new Request('http://localhost/api/cron/cancel-awaiting-payment', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }) as any)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.cancelledCount).toBe(1)
    expect(data.revertedRewardOrders).toBe(1)

    const freshOrder = await Order.findById(order._id)
    expect(freshOrder!.status).toBe('cancelled')

    const red = await StoreRedemption.findOne({ orderId: order._id })
    expect(red!.status).toBe('cancelled')

    const freshItem = await StoreItem.findById(item._id)
    expect(freshItem!.stock).toBe(5)
  })

  it('rechaza el cron sin CRON_SECRET correcto', async () => {
    const { GET: cancelCron } = await import('@/app/api/cron/cancel-awaiting-payment/route')
    const res = await cancelCron(new Request('http://localhost/api/cron/cancel-awaiting-payment') as any)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/{tenant}/orders — canjes vinculados a la orden', () => {
  let menuItemId: mongoose.Types.ObjectId

  beforeEach(async () => {
    menuItemId = new mongoose.Types.ObjectId()
    await PlatformConfig.create({ _id: 'platform', maintenanceMode: false })
    await Menu.create({
      tenantId: tenant._id,
      locationId: location._id,
      categories: [{
        _id: new mongoose.Types.ObjectId(),
        name: 'Bebidas',
        items: [{ _id: menuItemId, name: 'Agua', price: 1000, isEnabled: true }],
      }],
    })
  })

  it('crea el StoreRedemption con source checkout, orderId y sin expiración', async () => {
    const { POST } = await import('@/app/api/[tenant]/orders/route')

    const body = {
      locationId: location._id.toString(),
      items: [{
        type: 'menuItem',
        menuItemId: menuItemId.toString(),
        quantity: 1,
        customizations: [],
      }],
      customer: { name: 'María', phone: PHONE, email: 'maria@test.com' },
      mode: 'takeaway',
      paymentMethod: 'cash',
      rewardItems: [{ storeItemId: item._id.toString() }],
      loyaltyPointsRequired: item.pointsCost,
    }

    const req = new Request('http://localhost:3000/api/' + SLUG + '/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as any

    const res = await POST(req, { params: Promise.resolve({ tenant: SLUG }) })
    const data = await res.json()

    expect(res.status, JSON.stringify(data)).toBe(201)
    expect(data.order.rewardItems).toHaveLength(1)

    const red = await StoreRedemption.findOne({ storeItemId: item._id })
    expect(red, 'debe existir el StoreRedemption creado por el checkout').toBeTruthy()
    expect(red!.source).toBe('checkout')
    expect(String(red!.orderId)).toBe(String(data.order._id))
    expect(red!.expiresAt).toBeNull()
    expect(red!.status).toBe('pending')
    expect(String(red!.locationId)).toBe(String(location._id))
    expect(String(red!.memberId)).toBe(String(member._id))
  })

  it('respeta el máximo de premios por pedido (default 1, configurable hasta 5)', async () => {
    const { POST } = await import('@/app/api/[tenant]/orders/route')
    const second = await makeItem({ name: 'Segundo premio' })

    const makeBody = (rewardItemIds: string[], points: number) => ({
      locationId: location._id.toString(),
      items: [{
        type: 'menuItem',
        menuItemId: menuItemId.toString(),
        quantity: 1,
        customizations: [],
      }],
      customer: { name: 'María', phone: PHONE, email: 'maria@test.com' },
      mode: 'takeaway',
      paymentMethod: 'cash',
      rewardItems: rewardItemIds.map(storeItemId => ({ storeItemId })),
      loyaltyPointsRequired: points,
    })

    const doPost = (body: Record<string, any>) =>
      POST(
        new Request('http://localhost:3000/api/' + SLUG + '/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }) as any,
        { params: Promise.resolve({ tenant: SLUG }) }
      )

    const twoRewards = [item._id.toString(), second._id.toString()]

    // Default del tenant = 1 premio por pedido → 400
    const rejected = await doPost(makeBody(twoRewards, item.pointsCost + second.pointsCost))
    expect(rejected.status).toBe(400)
    const rejectedData = await rejected.json()
    expect(rejectedData.error).toMatch(/hasta 1 premio/i)

    // El tenant habilita 2 → pasa, y las dos líneas de premio viajan en la orden
    await Tenant.updateOne({ _id: tenant._id }, { $set: { 'store.maxRewardsPerOrder': 2 } })

    const accepted = await doPost(makeBody(twoRewards, item.pointsCost + second.pointsCost))
    const acceptedData = await accepted.json()
    expect(accepted.status, JSON.stringify(acceptedData)).toBe(201)
    expect(acceptedData.order.rewardItems).toHaveLength(2)

    const order = await Order.findById(acceptedData.order._id)
    expect(order!.items.filter((i: any) => i.itemType === 'reward')).toHaveLength(2)
    expect(order!.items.filter((i: any) => i.itemType === 'reward').every((i: any) => i.price === 0 && i.subtotal === 0)).toBe(true)
  })

  it('acepta la línea de premio del carrito dentro de items sin duplicarla ni 400', async () => {
    const { POST } = await import('@/app/api/[tenant]/orders/route')

    // El carrito unificado (Opción 2) manda la línea reward en items
    const body = {
      locationId: location._id.toString(),
      items: [
        {
          type: 'menuItem',
          menuItemId: menuItemId.toString(),
          quantity: 1,
          customizations: [],
          addedFrom: 'menu',
        },
        {
          type: 'reward',
          storeItemId: item._id.toString(),
          pointsCost: item.pointsCost,
          quantity: 1,
          customizations: [],
          addedFrom: 'store',
        },
      ],
      customer: { name: 'María', phone: PHONE, email: 'maria@test.com' },
      mode: 'takeaway',
      paymentMethod: 'cash',
      rewardItems: [{ storeItemId: item._id.toString() }],
      loyaltyPointsRequired: item.pointsCost,
    }

    const res = await POST(
      new Request('http://localhost:3000/api/' + SLUG + '/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }) as any,
      { params: Promise.resolve({ tenant: SLUG }) }
    )
    const data = await res.json()
    expect(res.status, JSON.stringify(data)).toBe(201)

    // La línea canónica la arma el servidor desde rewardItems: exactamente una
    const order = await Order.findById(data.order._id)
    const rewardLines = order!.items.filter((i: any) => i.itemType === 'reward')
    expect(rewardLines).toHaveLength(1)
    expect(rewardLines[0].price).toBe(0)
    expect(String(rewardLines[0].storeItemId)).toBe(String(item._id))

    const red = await StoreRedemption.findOne({ orderId: order!._id })
    expect(red).toBeTruthy()
  })

  it('rechaza 400 si el carrito solo trae líneas reward y no hay rewardItems validados', async () => {
    const { POST } = await import('@/app/api/[tenant]/orders/route')

    const body = {
      locationId: location._id.toString(),
      items: [{
        type: 'reward',
        storeItemId: item._id.toString(),
        pointsCost: item.pointsCost,
        quantity: 1,
        customizations: [],
        addedFrom: 'store',
      }],
      customer: { name: 'María', phone: PHONE, email: 'maria@test.com' },
      mode: 'takeaway',
      paymentMethod: 'cash',
      rewardItems: [],
      loyaltyPointsRequired: 0,
    }

    const res = await POST(
      new Request('http://localhost:3000/api/' + SLUG + '/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }) as any,
      { params: Promise.resolve({ tenant: SLUG }) }
    )
    expect(res.status).toBe(400)
  })
})
