// ============================================================================
// orders-sede-isolation.test.ts — Aislamiento por sede en acciones del board
// ============================================================================
// Evidencia ejecutable de los guards para que ninguna sede actúe (ni vea) sobre
// pedidos de otra. Solo admin/superadmin cruzan sedes; un usuario con
// assignedLocations solo opera las suyas:
//
//   1. PATCH /orders/[id]/status               → 404 en sede ajena
//   2. GET   /orders/[id]                      → 404 en sede ajena (no filtra)
//   3. DELETE /orders/[id]                     → 404 en sede ajena, sin efectos
//   4. PATCH /orders/[id]/confirm-transfer-admin → 404 en sede ajena
//   5. POST  /orders/cleanup-cancelled         → deleteMany acotado por sede
//
// El guard se ubica ANTES de las validaciones de negocio, así que el marcador
// "pasó el guard" es un 400/409 de transición (nunca un 404). SyncLayer/POS
// entra por X-Internal-Secret y queda exento (mismo criterio que los guards de
// transición).
//
// Ejecutar: npx vitest run __tests__/integration/orders-sede-isolation.test.ts
// ============================================================================

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/crypto', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/crypto')>()
  return {
    ...orig,
    encrypt: vi.fn((text: string) => `encrypted:${text}`),
    safeDecrypt: vi.fn((text: string) => text.replace(/^encrypted:/, '')),
  }
})

vi.mock('@/lib/push', () => ({
  sendAdminPushNotification: vi.fn().mockResolvedValue(undefined),
}))

const confirmOrderPaymentCoreMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/sync-layer', () => ({
  pushOrderToSyncLayer: vi.fn().mockResolvedValue(undefined),
  confirmOrderPaymentCore: (...args: unknown[]) => confirmOrderPaymentCoreMock(...args),
  confirmOrderPayment: vi.fn().mockResolvedValue(undefined),
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
  toPesos: vi.fn((cents: number) => cents / 100),
}))
vi.mock('@/lib/hooks/useEstimatedTimeAdjustment', () => ({
  triggerBackgroundAdjustment: vi.fn(),
}))
vi.mock('@/lib/events', () => ({
  captureOrderStatusChanged: vi.fn(),
}))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'
import UserLocationRole from '@/models/UserLocationRole'
import { PATCH as statusPATCH } from '@/app/api/[tenant]/orders/[orderId]/status/route'
import { GET as orderGET, DELETE as orderDELETE } from '@/app/api/[tenant]/orders/[orderId]/route'
import { PATCH as confirmTransferPATCH } from '@/app/api/[tenant]/orders/[orderId]/confirm-transfer-admin/route'
import { POST as cleanupPOST } from '@/app/api/[tenant]/orders/cleanup-cancelled/route'
import { auth } from '@/lib/auth'
import type { HydratedDocument } from 'mongoose'
import type { ITenant } from '@/models/Tenant'
import type { ILocation } from '@/models/Location'
import type { IOrder } from '@/models/Order'

const SLUG = 'sede-iso-test'
const INTERNAL_SECRET = 'sede-iso-internal-secret'
// userId de la fila ULR del manager (hex ObjectId: el modelo lo exige).
const MANAGER_ULR_ID = '507f1f77bcf86cd799439011'

let tenant: HydratedDocument<ITenant>
let loc1: HydratedDocument<ILocation> // sede propia del usuario scoped
let loc2: HydratedDocument<ILocation> // sede ajena
let orderSeq = 0

beforeAll(() => {
  // matchesInternalSecret lee los env en el momento de la llamada.
  process.env.SYNC_LAYER_SECRET = INTERNAL_SECRET
})

beforeEach(async () => {
  tenant = await Tenant.create({
    slug: SLUG,
    name: 'Sede Iso (test)',
    isActive: true,
    status: 'active',
    plan: 'full',
    flags: {},
  })
  loc1 = await Location.create({
    tenantId: tenant._id,
    slug: 'sede-a',
    name: 'Sede A',
    address: 'Av Test 1000',
    isActive: true,
    timezone: 'America/Argentina/Buenos_Aires',
  })
  loc2 = await Location.create({
    tenantId: tenant._id,
    slug: 'sede-b',
    name: 'Sede B',
    address: 'Av Test 2000',
    isActive: true,
    timezone: 'America/Argentina/Buenos_Aires',
  })
})

function setSession(role: string, assignedLocations: string[], id = `user-${role}`) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id,
      role,
      email: `${role}@test.com`,
      tenantId: tenant._id.toString(),
      tenantSlug: SLUG,
      assignedLocations,
      assignedTenants: [tenant._id.toString()],
    },
    expires: '',
  } as unknown as Awaited<ReturnType<typeof auth>>)
}

async function seedOrder(
  loc: HydratedDocument<ILocation>,
  overrides: Record<string, unknown> = {}
): Promise<HydratedDocument<IOrder>> {
  orderSeq += 1
  const orderNumber = `ISO-${orderSeq}`
  await Order.collection.insertMany([
    {
      tenantId: tenant._id,
      locationId: loc._id,
      orderNumber,
      status: 'confirmed',
      deletedAt: null,
      customer: { name: 'Cliente Iso', phone: '+5491122334455', email: 'iso@test.com' },
      payment: { method: 'cash', status: 'pending' },
      total: 1000,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    },
  ])
  const order = await Order.findOne({ orderNumber })
  if (!order) throw new Error(`seedOrder: ${orderNumber} no persistió`)
  return order
}

function statusReq(orderId: string, body: object, internal = false): NextRequest {
  return new NextRequest(`http://localhost/api/${SLUG}/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(internal ? { 'x-internal-secret': INTERNAL_SECRET } : {}),
    },
    body: JSON.stringify(body),
  })
}
function statusParams(orderId: string) {
  return { params: Promise.resolve({ tenant: SLUG, orderId }) }
}

function orderReq(orderId: string, method: 'GET' | 'DELETE'): NextRequest {
  return new NextRequest(`http://localhost/api/${SLUG}/orders/${orderId}`, { method })
}
function orderParams(orderId: string) {
  return { params: Promise.resolve({ tenant: SLUG, orderId }) }
}

function transferReq(orderId: string): NextRequest {
  return new NextRequest(`http://localhost/api/${SLUG}/orders/${orderId}/confirm-transfer-admin`, {
    method: 'PATCH',
  })
}

function cleanupReq(): NextRequest {
  return new NextRequest(`http://localhost/api/${SLUG}/orders/cleanup-cancelled`, {
    method: 'POST',
  })
}
function tenantParams() {
  return { params: Promise.resolve({ tenant: SLUG }) }
}

/* ══════════════════════════════════════════════════════════════════════════
   1. PATCH /orders/[id]/status
   ══════════════════════════════════════════════════════════════════════════ */
describe('PATCH /orders/[id]/status — aislamiento por sede', () => {
  it('scoped a L1 sobre pedido de L2 → 404 "Orden no encontrada" (no filtra existencia)', async () => {
    setSession('manager', [loc1._id.toString()])
    const order = await seedOrder(loc2)

    const res = await statusPATCH(
      statusReq(order._id.toString(), { status: 'preparing' }),
      statusParams(order._id.toString())
    )
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Orden no encontrada')
  })

  it('scoped a L1 sobre pedido de L1 → pasa el guard (llega a transición → 400, no 404)', async () => {
    setSession('manager', [loc1._id.toString()])
    const order = await seedOrder(loc1, { status: 'delivered' })

    const res = await statusPATCH(
      statusReq(order._id.toString(), { status: 'preparing' }),
      statusParams(order._id.toString())
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('No se puede pasar de "delivered"')
  })

  it('admin sin sedes asignadas sobre pedido de L2 → pasa el guard (400 transición)', async () => {
    setSession('admin', [])
    const order = await seedOrder(loc2, { status: 'delivered' })

    const res = await statusPATCH(
      statusReq(order._id.toString(), { status: 'preparing' }),
      statusParams(order._id.toString())
    )
    expect(res.status).toBe(400)
  })

  it('superadmin sobre pedido de L2 → pasa el guard (400 transición)', async () => {
    setSession('superadmin', [])
    const order = await seedOrder(loc2, { status: 'delivered' })

    const res = await statusPATCH(
      statusReq(order._id.toString(), { status: 'preparing' }),
      statusParams(order._id.toString())
    )
    expect(res.status).toBe(400)
  })

  it('manager legacy sin sedes asignadas sobre L2 → pasa (no regresión single-sede)', async () => {
    setSession('manager', [])
    const order = await seedOrder(loc2, { status: 'delivered' })

    const res = await statusPATCH(
      statusReq(order._id.toString(), { status: 'preparing' }),
      statusParams(order._id.toString())
    )
    expect(res.status).toBe(400)
  })

  it('internal secret (SyncLayer/POS) → exento del guard de sede (409 terminal, no 404)', async () => {
    setSession('manager', [loc1._id.toString()])
    const order = await seedOrder(loc2, { status: 'delivered' })

    const res = await statusPATCH(
      statusReq(order._id.toString(), { status: 'preparing' }, true),
      statusParams(order._id.toString())
    )
    // El camino interno salta el grafo de transiciones a propósito y cae en el
    // terminal guard: prueba de que ni la auth de sesión ni el guard corrieron.
    expect(res.status).toBe(409)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   2-3. GET y DELETE /orders/[id]
   ══════════════════════════════════════════════════════════════════════════ */
describe('GET/DELETE /orders/[id] — aislamiento por sede', () => {
  it('GET scoped a L1 sobre pedido de L2 → 404', async () => {
    setSession('manager', [loc1._id.toString()])
    const order = await seedOrder(loc2)

    const res = await orderGET(orderReq(order._id.toString(), 'GET'), orderParams(order._id.toString()))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Orden no encontrada')
  })

  it('GET scoped a L1 sobre pedido de L1 → 200 con la orden', async () => {
    setSession('manager', [loc1._id.toString()])
    const order = await seedOrder(loc1)

    const res = await orderGET(orderReq(order._id.toString(), 'GET'), orderParams(order._id.toString()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.order.orderNumber).toBe(order.orderNumber)
    expect(body.order.locationName).toBe('Sede A')
  })

  it('DELETE scoped a L1 sobre pedido de L2 → 404 y la orden NO se borra', async () => {
    setSession('manager', [loc1._id.toString()])
    const order = await seedOrder(loc2)

    const res = await orderDELETE(orderReq(order._id.toString(), 'DELETE'), orderParams(order._id.toString()))
    expect(res.status).toBe(404)

    const fresh = await Order.findById(order._id).lean()
    expect(fresh?.deletedAt).toBeNull()
  })

  it('DELETE scoped a L1 sobre pedido de L1 → 200 y queda soft-deleteado', async () => {
    setSession('manager', [loc1._id.toString()])
    const order = await seedOrder(loc1)

    const res = await orderDELETE(orderReq(order._id.toString(), 'DELETE'), orderParams(order._id.toString()))
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)

    const fresh = await Order.findById(order._id).lean()
    expect(fresh?.deletedAt).not.toBeNull()
  })

  it('DELETE admin sobre pedido de L2 → 200 (admin cruza sedes)', async () => {
    setSession('admin', [])
    const order = await seedOrder(loc2)

    const res = await orderDELETE(orderReq(order._id.toString(), 'DELETE'), orderParams(order._id.toString()))
    expect(res.status).toBe(200)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   4. PATCH /orders/[id]/confirm-transfer-admin
   ══════════════════════════════════════════════════════════════════════════ */
describe('PATCH /orders/[id]/confirm-transfer-admin — aislamiento por sede', () => {
  it('scoped a L1 sobre transferencia de L2 → 404', async () => {
    setSession('manager', [loc1._id.toString()])
    const order = await seedOrder(loc2, {
      status: 'awaiting_confirmation',
      payment: { method: 'transfer', status: 'pending' },
    })

    const res = await confirmTransferPATCH(transferReq(order._id.toString()), statusParams(order._id.toString()))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Orden no encontrada')
  })

  it('scoped a L1 sobre pedido de L1 (no transferencia) → pasa el guard (400 de negocio)', async () => {
    setSession('manager', [loc1._id.toString()])
    const order = await seedOrder(loc1, { payment: { method: 'cash', status: 'pending' } })

    const res = await confirmTransferPATCH(transferReq(order._id.toString()), statusParams(order._id.toString()))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Esta orden no es de tipo transferencia')
  })

  it('admin sobre pedido de L2 (no transferencia) → pasa el guard (400 de negocio)', async () => {
    setSession('admin', [])
    const order = await seedOrder(loc2, { payment: { method: 'cash', status: 'pending' } })

    const res = await confirmTransferPATCH(transferReq(order._id.toString()), statusParams(order._id.toString()))
    expect(res.status).toBe(400)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   5. POST /orders/cleanup-cancelled — deleteMany acotado por sede
   ══════════════════════════════════════════════════════════════════════════ */
describe('POST /orders/cleanup-cancelled — aislamiento por sede', () => {
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000

  async function seedCancelled(loc: HydratedDocument<ILocation>, ageMs: number) {
    orderSeq += 1
    const orderNumber = `ISO-C-${orderSeq}`
    const old = new Date(Date.now() - ageMs)
    await Order.collection.insertMany([
      {
        tenantId: tenant._id,
        locationId: loc._id,
        orderNumber,
        status: 'cancelled',
        deletedAt: null,
        customer: { name: 'Cancelado', phone: 'x', email: 'x@x.x' },
        payment: { method: 'cash', status: 'pending' },
        total: 500,
        items: [],
        createdAt: old,
        updatedAt: old,
      },
    ])
    const order = await Order.findOne({ orderNumber })
    if (!order) throw new Error(`seedCancelled: ${orderNumber} no persistió`)
    return order
  }

  it('flag ON + manager ULR + sedes asignadas [L1]: borra solo pedidos viejos de L1', async () => {
    tenant.flags = { 'rbac.sedeScope': true }
    tenant.markModified('flags')
    await tenant.save()
    await UserLocationRole.create({
      tenantId: tenant._id,
      userId: MANAGER_ULR_ID,
      locationId: null,
      role: 'manager',
      isActive: true,
    })

    const oldL1 = await seedCancelled(loc1, TWO_DAYS)
    const oldL2 = await seedCancelled(loc2, TWO_DAYS)
    const freshL1 = await seedCancelled(loc1, 60 * 60 * 1000) // 1h, no entra al cutoff

    setSession('manager', [loc1._id.toString()], MANAGER_ULR_ID)
    const res = await cleanupPOST(cleanupReq(), tenantParams())
    expect(res.status).toBe(200)
    expect((await res.json()).deleted).toBe(1)

    expect(await Order.findById(oldL1._id)).toBeNull()
    expect(await Order.findById(oldL2._id)).not.toBeNull() // sede ajena intacta
    expect(await Order.findById(freshL1._id)).not.toBeNull() // cutoff de 24h intacto
  })

  it('flag ON + manager legacy sin sedes asignadas → limpia todo el tenant (no regresión)', async () => {
    tenant.flags = { 'rbac.sedeScope': true }
    tenant.markModified('flags')
    await tenant.save()
    await UserLocationRole.create({
      tenantId: tenant._id,
      userId: MANAGER_ULR_ID,
      locationId: null,
      role: 'manager',
      isActive: true,
    })

    await seedCancelled(loc1, TWO_DAYS)
    await seedCancelled(loc2, TWO_DAYS)

    setSession('manager', [], MANAGER_ULR_ID)
    const res = await cleanupPOST(cleanupReq(), tenantParams())
    expect(res.status).toBe(200)
    expect((await res.json()).deleted).toBe(2)
  })

  it('flag OFF + admin con sedes asignadas [L1] → admin no se acota, limpia el tenant', async () => {
    await seedCancelled(loc1, TWO_DAYS)
    await seedCancelled(loc2, TWO_DAYS)

    setSession('admin', [loc1._id.toString()])
    const res = await cleanupPOST(cleanupReq(), tenantParams())
    expect(res.status).toBe(200)
    expect((await res.json()).deleted).toBe(2)
  })
})
