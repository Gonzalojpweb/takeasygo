import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import Order from '@/models/Order'
import PlatformConfig from '@/models/PlatformConfig'
import Promotion from '@/models/Promotion'
import type { NextRequest } from 'next/server'

/**
 * Promociones "2 por precio fijo" — el precio por bundle.
 *
 * Bug original: cada unidad se emitía como una línea con
 * price = promotion.price, así que 2 cachapas a $18.000 cobraban $36.000.
 * El modelo nuevo/agrupado cobra promotion.price UNA sola vez por bundle:
 *
 *   - Línea con _bundle (cliente nuevo): 1 línea de carrito = 1 combo;
 *     el server la explota en una línea por unidad con el precio alocado.
 *   - Líneas por unidad sin _bundle (carts viejos, re-pedidos): se agrupan
 *     por promotionId y se reparte promotion.price entre las unidades.
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

vi.mock('@/lib/sync-layer', () => ({
  pushOrderToSyncLayer: vi.fn().mockResolvedValue(undefined),
  confirmOrderPaymentCore: vi.fn().mockResolvedValue(undefined),
  notifySyncLayerStatus: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/order-side-effects', () => ({
  notifyCashOrderCreated: vi.fn().mockResolvedValue(undefined),
  syncOrderAfterStatusSet: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/events', () => ({ captureOrderStatusChanged: vi.fn() }))
vi.mock('@/lib/events-server', () => ({
  captureCheckoutCompletedFromOrder: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/whatsapp', () => ({ sendWhatsApp: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/whatsapp-message', () => ({ buildOrderWhatsAppMessage: vi.fn().mockReturnValue('') }))
vi.mock('@/lib/impact', () => ({ registerImpactEvent: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@/lib/hidden-rewards', () => ({
  getDeviceIdIfExists: vi.fn().mockReturnValue(null),
  finalizeHiddenRewardClaims: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/corporateAccess', () => ({ corporateHasAccess: vi.fn().mockReturnValue(false) }))

// Pass-through: sin recargo, el total es exactamente la suma de los subtotales.
vi.mock('@/lib/pricing', () => ({
  calculateFinalTotal: vi.fn((total: number) => ({
    finalTotal: total,
    baseTotal: total,
    surchargeAmount: 0,
    surchargePercent: 0,
    platformFeeAmount: 0,
  })),
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

// Sin mitad y mitad en estas pruebas: el precio es promotion.price siempre.
vi.mock('@takeasygo/business', () => ({
  resolveHalfPriceCustomizations: vi.fn().mockReturnValue(null),
}))

import { POST as createOrderPOST } from '@/app/api/[tenant]/orders/route'

const SLUG = 'test-tenant'
const PRICE = 1_800_000 // $18.000 en centavos
const HALF = PRICE / 2

function createReq(body: object): NextRequest {
  return new Request(`http://localhost:3000/api/${SLUG}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

const createParams = { params: Promise.resolve({ tenant: SLUG }) }

let tenant: Awaited<ReturnType<typeof Tenant.create>>
let location: Awaited<ReturnType<typeof Location.create>>
let promo: Awaited<ReturnType<typeof Promotion.create>>
let itemA: mongoose.Types.ObjectId
let itemB: mongoose.Types.ObjectId
let itemC: mongoose.Types.ObjectId // fuera de la promo
const SLOT = 'Elegí tus 2 cachapas'

async function post(items: unknown[]) {
  return createOrderPOST(
    createReq({
      locationId: location._id.toString(),
      items,
      customer: { name: 'Cliente Promo', phone: '' },
      mode: 'takeaway',
      paymentMethod: 'cash',
    }),
    createParams
  )
}

function unit(itemId: mongoose.Types.ObjectId, name: string, extra: Record<string, unknown> = {}) {
  return {
    menuItemId: itemId.toString(),
    itemName: name,
    slotName: SLOT,
    ...extra,
  }
}

function bundleLine(units: unknown[], quantity = 1) {
  return {
    type: 'promotion',
    promotionId: promo._id.toString(),
    quantity,
    customizations: [],
    _bundle: [{ slotName: SLOT, units }],
  }
}

function legacyLine(itemId: mongoose.Types.ObjectId, name: string, quantity = 1) {
  return {
    type: 'promotion',
    promotionId: promo._id.toString(),
    menuItemId: itemId.toString(),
    quantity,
    customizations: [],
    _itemName: name,
    _slotName: SLOT,
  }
}

beforeEach(async () => {
  itemA = new mongoose.Types.ObjectId()
  itemB = new mongoose.Types.ObjectId()
  itemC = new mongoose.Types.ObjectId()

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
    isActive: true,
    categories: [{
      _id: new mongoose.Types.ObjectId(),
      name: 'Cachapas',
      isAvailable: true,
      items: [
        {
          _id: itemA,
          name: 'Cachapa L',
          price: 950_000,
          isAvailable: true,
          customizationGroups: [{
            _id: new mongoose.Types.ObjectId(),
            name: 'Queso',
            options: [{ _id: new mongoose.Types.ObjectId(), name: 'Extra queso', extraPrice: 500_000 }],
          }],
        },
        { _id: itemB, name: 'Cachapa M', price: 900_000, isAvailable: true },
        { _id: itemC, name: 'Bebida Cola', price: 300_000, isAvailable: true },
      ],
    }],
  })

  promo = await Promotion.create({
    tenantId: tenant._id,
    locationId: location._id,
    scope: 'tenant',
    type: 'sale',
    title: '2 CACHAPAS L',
    price: PRICE,
    currency: 'ARS',
    isActive: true,
    visibility: 'both',
    allowCustomization: true,
    slots: [{
      name: SLOT,
      requiredQuantity: 2,
      itemIds: [itemA, itemB],
      customizationMode: 'full',
    }],
  })
})

describe('bundle (_bundle) — 1 línea de carrito = 1 combo', () => {
  it('cobra promotion.price UNA vez: 2 unidades → total $18.000 (no $36.000)', async () => {
    const res = await post([
      bundleLine([
        unit(itemA, 'Cachapa L'),
        unit(itemB, 'Cachapa M'),
      ]),
    ])
    expect(res.ok).toBe(true)

    const order = await Order.findOne({ tenantId: tenant._id }).lean()
    expect(order).toBeTruthy()
    expect(order!.total).toBe(PRICE)
    expect(order!.items).toHaveLength(2)
    expect(order!.items.reduce((s, i) => s + i.subtotal, 0)).toBe(PRICE)
    for (const item of order!.items) {
      expect(item.itemType).toBe('promotion')
      expect(item.promotionId).toBe(promo._id.toString())
      expect(item.extraPrice).toBe(0)
      expect(item.menuItemId).toBeTruthy()
      expect(item.slotName).toBe(SLOT)
      expect(item.quantity).toBe(1)
      expect(item.subtotal).toBe(HALF)
    }
  })

  it('dos bundles en la misma línea (quantity 2) → 4 unidades, total $36.000', async () => {
    const res = await post([
      bundleLine(
        [
          unit(itemA, 'Cachapa L'),
          unit(itemB, 'Cachapa M'),
          unit(itemA, 'Cachapa L'),
          unit(itemB, 'Cachapa M'),
        ],
        2
      ),
    ])
    expect(res.ok).toBe(true)

    const order = await Order.findOne({ tenantId: tenant._id }).lean()
    expect(order!.total).toBe(PRICE * 2)
    expect(order!.items).toHaveLength(4)
    expect(order!.items.reduce((s, i) => s + i.subtotal, 0)).toBe(PRICE * 2)
  })

  it('congelamiento de precio: customización con extraPrice NO suma dentro de la promo', async () => {
    const res = await post([
      bundleLine([
        unit(itemA, 'Cachapa L', {
          customizations: [{ groupName: 'Queso', selectedOptions: [{ name: 'Extra queso' }] }],
        }),
        unit(itemB, 'Cachapa M'),
      ]),
    ])
    expect(res.ok).toBe(true)

    const order = await Order.findOne({ tenantId: tenant._id }).lean()
    expect(order!.total).toBe(PRICE)

    const customized = order!.items.find((i) => i.customizations.length > 0)
    expect(customized).toBeTruthy()
    // La customización queda resuelta para la cocina…
    expect(customized!.customizations[0].selectedOptions[0].name).toBe('Extra queso')
    // …pero el precio del renglón sigue siendo la parte que le toca al bundle.
    expect(customized!.extraPrice).toBe(0)
    expect(customized!.subtotal).toBe(HALF)
    expect(order!.items.reduce((s, i) => s + i.subtotal, 0)).toBe(PRICE)
  })

  it('bundle incompleto → 400', async () => {
    const res = await post([bundleLine([unit(itemA, 'Cachapa L')])])
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/requiere/i)
  })

  it('ítem que no pertenece al slot → 400', async () => {
    const res = await post([
      bundleLine([unit(itemA, 'Cachapa L'), unit(itemC, 'Bebida Cola')]),
    ])
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/no pertenece/i)
  })

  it('mezclar bundle con líneas sueltas de la misma promo → 400', async () => {
    const res = await post([
      bundleLine([unit(itemA, 'Cachapa L'), unit(itemB, 'Cachapa M')]),
      legacyLine(itemA, 'Cachapa L'),
    ])
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/mezclar/i)
  })
})

describe('legacy (líneas por unidad, sin _bundle) — carts viejos y re-pedidos', () => {
  it('2 líneas de 1 unidad → agrupa y cobra $18.000 una sola vez (bug: $36.000)', async () => {
    const res = await post([
      legacyLine(itemA, 'Cachapa L'),
      legacyLine(itemB, 'Cachapa M'),
    ])
    expect(res.ok).toBe(true)

    const order = await Order.findOne({ tenantId: tenant._id }).lean()
    expect(order!.total).toBe(PRICE)
    expect(order!.items).toHaveLength(2)
    expect(order!.items.reduce((s, i) => s + i.subtotal, 0)).toBe(PRICE)
    for (const item of order!.items) {
      expect(item.extraPrice).toBe(0)
      expect(item.subtotal).toBe(HALF)
      expect(item.slotName).toBe(SLOT)
    }
  })

  it('1 línea con quantity 2 → reparte el precio del bundle en la línea', async () => {
    const res = await post([legacyLine(itemA, 'Cachapa L', 2)])
    expect(res.ok).toBe(true)

    const order = await Order.findOne({ tenantId: tenant._id }).lean()
    expect(order!.total).toBe(PRICE)
    expect(order!.items).toHaveLength(1)
    expect(order!.items[0].quantity).toBe(2)
    expect(order!.items[0].price).toBe(HALF)
    expect(order!.items[0].subtotal).toBe(PRICE)
  })

  it('cantidad que no completa el slot (1 unidad) → 400', async () => {
    const res = await post([legacyLine(itemA, 'Cachapa L')])
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/incompleta/i)
  })

  it('cantidades inconsistentes entre slots → 400', async () => {
    // Segundo slot con requiredQuantity 1: 2 bebidas = 2 combos contra
    // 2 cachapas (req 2) = 1 combo → no cierra.
    await Promotion.updateOne({ _id: promo._id }, {
      $push: { slots: { name: 'Bebida', requiredQuantity: 1, itemIds: [itemC] } },
    })
    const res = await post([
      legacyLine(itemA, 'Cachapa L'),
      legacyLine(itemB, 'Cachapa M'),
      { ...legacyLine(itemC, 'Bebida Cola'), _slotName: 'Bebida' },
      { ...legacyLine(itemC, 'Bebida Cola'), _slotName: 'Bebida' },
    ])
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/inconsistentes/i)
  })
})
