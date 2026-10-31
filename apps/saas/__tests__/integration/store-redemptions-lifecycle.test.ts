import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import LoyaltyMember from '@/models/LoyaltyMember'
import StoreItem from '@/models/StoreItem'
import StoreRedemption from '@/models/StoreRedemption'
import Order from '@/models/Order'
import { hashPhone } from '@/lib/crypto'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/apiAuth', () => ({
  requireAuth: vi.fn().mockResolvedValue(null),
  // Auditoría 30/10/2026: las rutas usan además el rol mínimo (requireTenantRole).
  requireTenantRole: vi.fn().mockResolvedValue(null),
  ADMIN_ROLES: ['admin'],
  MANAGE_ROLES: ['admin', 'manager'],
  CASH_ROLES: ['admin', 'manager', 'cashier'],
  FLOOR_ROLES: ['admin', 'manager', 'cashier', 'staff', 'host', 'waiter'],
  getSessionUser: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'admin-id', role: 'superadmin', tenantSlug: 'test-tenant' },
  }),
  requireAuth: vi.fn().mockResolvedValue(null),
  getSessionUser: vi.fn().mockResolvedValue({ id: 'admin-id', role: 'superadmin' }),
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
  sendPushToSubscription: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/sync-layer', () => ({
  pushOrderToSyncLayer: vi.fn().mockResolvedValue(undefined),
  confirmOrderPaymentCore: vi.fn().mockResolvedValue(undefined),
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
vi.mock('@/lib/hooks/useEstimatedTimeAdjustment', () => ({
  triggerBackgroundAdjustment: vi.fn(),
}))
vi.mock('@/lib/events', () => ({
  captureOrderStatusChanged: vi.fn(),
}))
vi.mock('@/lib/loyalty', () => ({
  validateCheckoutRewards: vi.fn().mockReturnValue({ valid: true, items: [] }),
  addPointsFromOrder: vi.fn().mockResolvedValue(undefined),
  revertRewardRedemptions: vi.fn().mockResolvedValue(undefined),
}))

// El cron lee CRON_SECRET al cargar el módulo: setearlo antes del import dinámico.
process.env.CRON_SECRET = 'test-cron-secret'

import { PATCH as claimPATCH } from '@/app/api/[tenant]/store/redemptions/[redemptionId]/claim/route'
import { PATCH as statusPATCH } from '@/app/api/[tenant]/orders/[orderId]/status/route'

const SLUG = 'test-tenant'
const PHONE = '+5491155556666'

let tenant: any
let location: any
let member: any
let item: any

async function runCron(authHeader?: string) {
  const { GET } = await import('@/app/api/cron/expire-store-redemptions/route')
  return GET(
    new Request('http://localhost/api/cron/expire-store-redemptions', {
      headers: authHeader ? { authorization: authHeader } : {},
    }) as any
  )
}

/** Canje standalone pendiente (expira +24h por el hook del modelo). */
async function makeStandalone(overrides: Record<string, any> = {}) {
  return StoreRedemption.create({
    tenantId: tenant._id,
    memberId: member._id,
    storeItemId: item._id,
    pointsUsed: 100,
    status: 'pending',
    source: 'standalone',
    ...overrides,
  })
}

/** Canje de checkout vinculado a una orden (expiresAt null por el hook). */
async function makeCheckout(order: any) {
  return StoreRedemption.create({
    tenantId: tenant._id,
    memberId: member._id,
    storeItemId: item._id,
    pointsUsed: 100,
    status: 'pending',
    source: 'checkout',
    orderId: order._id,
    locationId: location._id,
  })
}

/** Envejece el canje vencido (bypass de hooks, como el paso del tiempo). */
async function ageRedemption(id: any) {
  await StoreRedemption.collection.updateOne(
    { _id: id },
    { $set: { expiresAt: new Date(Date.now() - 60 * 1000) } }
  )
}

/** Simula los efectos de creación del canje standalone (débito completo). */
async function applyCreationEffects() {
  await LoyaltyMember.updateOne(
    { _id: member._id },
    {
      $set: {
        'loyalty.points': 0,
        'store.totalRedemptions': 1,
        'store.totalPointsSpent': 100,
      },
    }
  )
  await StoreItem.updateOne(
    { _id: item._id },
    { $set: { stock: 4, totalRedemptions: 1 } }
  )
}

async function makeReadyOrder() {
  return Order.create({
    tenantId: tenant._id,
    locationId: location._id,
    orderNumber: `ORD-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`,
    orderMode: 'takeaway',
    status: 'ready',
    customer: { name: 'María', phone: PHONE, phoneHash: hashPhone(PHONE) },
    payment: { status: 'approved', method: 'mercadopago' },
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
  })
}

beforeEach(async () => {
  tenant = await Tenant.create({
    name: 'Test Tenant',
    slug: SLUG,
    plan: 'full',
    status: 'active',
    isActive: true,
    pointsConfig: { welcomePoints: 100 },
    paymentSurcharges: { cash: { feePercent: 0 }, transfer: { feePercent: 0 }, mercadopago: { feePercent: 0 } },
    store: { enabled: true, enableCheckoutRedemption: true, redemptionExpiryHours: 24 },
  })
  location = await Location.create({
    tenantId: tenant._id,
    name: 'Sede Central',
    slug: 'sede-central',
    address: 'Av. Test 123',
    isActive: true,
  })
  member = await LoyaltyMember.create({
    tenantId: tenant._id,
    name: 'María',
    phone: PHONE,
    phoneHash: hashPhone(PHONE),
    email: 'maria@test.com',
    status: 'active',
    loyalty: { points: 500 },
  })
  item = await StoreItem.create({
    tenantId: tenant._id,
    name: 'Cachapa',
    category: 'food',
    description: 'Deliciosa cachapa',
    imageUrl: 'https://example.com/cachapa.jpg',
    pointsCost: 100,
    cashValue: 2000,
    isActive: true,
    stock: 5,
  })
})

describe('Cron /api/cron/expire-store-redemptions', () => {
  it('rechaza sin CRON_SECRET correcto (401)', async () => {
    const sinHeader = await runCron()
    expect(sinHeader.status).toBe(401)

    const headerIncorrecto = await runCron('Bearer otro-secret')
    expect(headerIncorrecto.status).toBe(401)
  })

  it('expira standalone vencido: devuelve puntos, restaura stock y contadores', async () => {
    const red = await makeStandalone()
    await ageRedemption(red._id)
    await applyCreationEffects()

    const res = await runCron(`Bearer ${process.env.CRON_SECRET}`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.scanned).toBe(1)
    expect(data.expired).toBe(1)
    expect(data.pointsReturned).toBe(100)

    const freshRed = await StoreRedemption.findById(red._id)
    expect(freshRed!.status).toBe('expired')

    const freshMember = await LoyaltyMember.findById(member._id)
    expect(freshMember!.loyalty.points).toBe(100)
    expect(freshMember!.store.totalRedemptions).toBe(0)
    expect(freshMember!.store.totalPointsSpent).toBe(0)

    const freshItem = await StoreItem.findById(item._id)
    expect(freshItem!.stock).toBe(5)
    expect(freshItem!.totalRedemptions).toBe(0)
  })

  it('expira canje legacy sin source ni orderId (doc anterior al campo): se trata como standalone', async () => {
    // Insert crudo SIN los defaults/hooks del modelo: así estaban los canjes
    // en producción antes de agregar el campo source.
    const { insertedId } = await StoreRedemption.collection.insertOne({
      tenantId: tenant._id,
      memberId: member._id,
      storeItemId: item._id,
      pointsUsed: 100,
      status: 'pending',
      redemptionCode: 'TGO-TEST-LGC1',
      expiresAt: new Date(Date.now() - 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await applyCreationEffects()

    const res = await runCron(`Bearer ${process.env.CRON_SECRET}`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.scanned).toBe(1)
    expect(data.expired).toBe(1)
    expect(data.pointsReturned).toBe(100)

    const freshRed = await StoreRedemption.findById(insertedId)
    expect(freshRed!.status).toBe('expired')

    const freshMember = await LoyaltyMember.findById(member._id)
    expect(freshMember!.loyalty.points).toBe(100)
    expect(freshMember!.store.totalRedemptions).toBe(0)
    expect(freshMember!.store.totalPointsSpent).toBe(0)

    const freshItem = await StoreItem.findById(item._id)
    expect(freshItem!.stock).toBe(5)
    expect(freshItem!.totalRedemptions).toBe(0)
  })

  it('NO toca legacy con orderId (sin source pero vinculado a una orden)', async () => {
    await StoreRedemption.collection.insertOne({
      tenantId: tenant._id,
      memberId: member._id,
      storeItemId: item._id,
      pointsUsed: 100,
      status: 'pending',
      redemptionCode: 'TGO-TEST-LGC2',
      orderId: new StoreRedemption()._id,
      expiresAt: new Date(Date.now() - 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await applyCreationEffects()

    const res = await runCron(`Bearer ${process.env.CRON_SECRET}`)
    const data = await res.json()
    expect(data.scanned).toBe(0)
    expect(data.expired).toBe(0)
    expect(data.pointsReturned).toBe(0)

    // Los puntos siguen debitados (el cron no lo trató como standalone)
    const freshMember = await LoyaltyMember.findById(member._id)
    expect(freshMember!.loyalty.points).toBe(0)
  })

  it('es idempotente: el segundo run no devuelve los puntos otra vez', async () => {
    const red = await makeStandalone()
    await ageRedemption(red._id)
    await applyCreationEffects()

    await runCron(`Bearer ${process.env.CRON_SECRET}`)
    const segundo = await runCron(`Bearer ${process.env.CRON_SECRET}`)

    const dataSegundo = await segundo.json()
    expect(dataSegundo.scanned).toBe(0)
    expect(dataSegundo.expired).toBe(0)

    const freshMember = await LoyaltyMember.findById(member._id)
    expect(freshMember!.loyalty.points).toBe(100)
    expect(freshMember!.store.totalRedemptions).toBe(0)
  })

  it('NO toca checkout (expiresAt null), futuros ni ya procesados', async () => {
    const order = await makeReadyOrder()
    const checkout = await makeCheckout(order)
    const futuro = await makeStandalone()
    const reclamado = await makeStandalone({ status: 'claimed' })
    const cancelado = await makeStandalone({ status: 'cancelled' })
    await ageRedemption(reclamado._id)
    await ageRedemption(cancelado._id)
    await applyCreationEffects()

    const res = await runCron(`Bearer ${process.env.CRON_SECRET}`)
    const data = await res.json()
    expect(data.expired).toBe(0)
    expect(data.pointsReturned).toBe(0)

    expect((await StoreRedemption.findById(checkout._id))!.status).toBe('pending')
    expect((await StoreRedemption.findById(futuro._id))!.status).toBe('pending')
    expect((await StoreRedemption.findById(reclamado._id))!.status).toBe('claimed')
    expect((await StoreRedemption.findById(cancelado._id))!.status).toBe('cancelled')

    // Los puntos siguen debitados (el cron no devolvió nada)
    const freshMember = await LoyaltyMember.findById(member._id)
    expect(freshMember!.loyalty.points).toBe(0)
  })

  it('libera la deuda micro-SOS si el saldo queda >= 0 al devolver', async () => {
    const red = await makeStandalone()
    await ageRedemption(red._id)
    await applyCreationEffects()
    // Micro-SOS forzado al canjear (saldo exacto en 0 + deuda del 20%)
    await LoyaltyMember.updateOne(
      { _id: member._id },
      { $set: { 'sosConfig.hasPendingSos': true, 'sosConfig.sosUsed': 20 } }
    )

    await runCron(`Bearer ${process.env.CRON_SECRET}`)

    const freshMember = await LoyaltyMember.findById(member._id)
    expect(freshMember!.loyalty.points).toBe(100)
    expect(freshMember!.sosConfig.hasPendingSos).toBe(false)
    expect(freshMember!.sosConfig.sosUsed).toBe(0)
  })
})

describe('Claim de canjes — vencimiento y auto-claim', () => {
  it('al reclamar un canje vencido: 400 + devuelve los puntos (mismo flip que el cron)', async () => {
    const red = await makeStandalone()
    await ageRedemption(red._id)
    await applyCreationEffects()

    const req = new NextRequest(
      `http://localhost/api/${SLUG}/store/redemptions/${red._id}/claim`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    )
    const res = await claimPATCH(req, {
      params: Promise.resolve({ tenant: SLUG, redemptionId: red._id.toString() }),
    })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Redención expirada')

    const freshRed = await StoreRedemption.findById(red._id)
    expect(freshRed!.status).toBe('expired')

    const freshMember = await LoyaltyMember.findById(member._id)
    expect(freshMember!.loyalty.points).toBe(100)

    // El cron ya no lo barre (status expired): no hay doble devolución
    const cron = await runCron(`Bearer ${process.env.CRON_SECRET}`)
    const cronData = await cron.json()
    expect(cronData.expired).toBe(0)
    const memberTrasCron = await LoyaltyMember.findById(member._id)
    expect(memberTrasCron!.loyalty.points).toBe(100)
  })

  it('reclama un canje vigente → claimed con claimedAt (flujo manual)', async () => {
    const red = await makeStandalone()

    const req = new NextRequest(
      `http://localhost/api/${SLUG}/store/redemptions/${red._id}/claim`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    )
    const res = await claimPATCH(req, {
      params: Promise.resolve({ tenant: SLUG, redemptionId: red._id.toString() }),
    })
    expect(res.status).toBe(200)

    const freshRed = await StoreRedemption.findById(red._id)
    expect(freshRed!.status).toBe('claimed')
    expect(freshRed!.claimedAt).toBeTruthy()
  })

  it('al entregar el pedido (status → delivered) se auto-reclaman sus canjes de checkout', async () => {
    const order = await makeReadyOrder()
    const checkout = await makeCheckout(order)
    // Un standalone del mismo miembro NO se toca: no pertenece a la orden
    const standalone = await makeStandalone()

    const req = new Request(
      `http://localhost:3000/api/${SLUG}/orders/${order._id}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'delivered' }),
      }
    ) as any
    const res = await statusPATCH(req, {
      params: Promise.resolve({ tenant: SLUG, orderId: order._id.toString() }),
    })
    expect(res.status, await res.clone().text()).toBe(200)

    const freshOrder = await Order.findById(order._id)
    expect(freshOrder!.status).toBe('delivered')

    const freshCheckout = await StoreRedemption.findById(checkout._id)
    expect(freshCheckout!.status).toBe('claimed')
    expect(freshCheckout!.claimedAt).toBeTruthy()
    expect(String(freshCheckout!.locationId)).toBe(String(location._id))

    const freshStandalone = await StoreRedemption.findById(standalone._id)
    expect(freshStandalone!.status).toBe('pending')
  })
})
