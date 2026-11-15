import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import PlatformConfig from '@/models/PlatformConfig'
import Combo from '@/models/Combo'
import type { NextRequest } from 'next/server'

/**
 * Pedido online con un combo, de punta a punta (14/11/2026).
 *
 * Los combos de Keke Larry llegaban al carrito y nunca se cobraban. Esta
 * prueba descarta que el problema esté al crear el pedido o en el informe:
 * con el carrito exactamente como lo arma el menú público, el pedido se crea
 * (línea del combo con precio + platos a $0) y el informe lo cuenta. La causa
 * estaba en Mercado Pago (ver __tests__/lib/mp-items.test.ts).
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
vi.mock('@takeasygo/business', async (orig) => ({
  ...(await orig<typeof import('@takeasygo/business')>()),
  resolveHalfPriceCustomizations: vi.fn().mockReturnValue(null),
}))

import { POST as createOrderPOST } from '@/app/api/[tenant]/orders/route'

const SLUG = 'test-tenant'
const req = (body: object) => new Request(`http://localhost:3000/api/${SLUG}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as unknown as NextRequest
const P = { params: Promise.resolve({ tenant: SLUG }) }
let location: any
let combo: any
const BURGER = new mongoose.Types.ObjectId()
const FRIES = new mongoose.Types.ObjectId()

beforeEach(async () => {
  const tenant = await Tenant.create({ name: 'T', slug: SLUG, plan: 'full', status: 'active', paymentSurcharges: { cash: { feePercent: 0 }, transfer: { feePercent: 0 }, mercadopago: { feePercent: 0 } } })
  location = await Location.create({ tenantId: tenant._id, name: 'Sede', slug: 'sede', address: 'X', isActive: true })
  await PlatformConfig.create({ _id: 'platform', maintenanceMode: false })
  await Menu.create({ tenantId: tenant._id, locationId: location._id, isActive: true, categories: [{ _id: new mongoose.Types.ObjectId(), name: 'Burgers', isAvailable: true, items: [
    { _id: BURGER, name: 'Tyron', price: 1_000_000, isAvailable: true },
    { _id: FRIES, name: 'Crispy', price: 900_000, isAvailable: true },
  ] }] })
  combo = await Combo.create({ tenantId: tenant._id, locationId: location._id, name: 'DOS BESTIAS', isActive: true, visibility: 'both', priceMode: 'fixed', fixedPrice: 1_700_000, minItems: 2, maxItems: 2, allowRepeat: false, itemPool: [String(BURGER), String(FRIES)] })
})

it('pedido online con combo (carrito tal cual lo arma el menú): se crea y cuenta en el informe', async () => {
  for (const mode of ['takeaway', 'dine-in']) {
    const res = await createOrderPOST(req({
      locationId: location._id.toString(),
      customer: { name: 'Cliente', phone: '' },
      mode, paymentMethod: 'cash',
      items: [{
        cartItemId: `combo:${combo._id}:1`, comboId: String(combo._id), name: 'DOS BESTIAS', basePrice: 1_700_000, extraPrice: 0, price: 1_700_000,
        quantity: 1, customizations: [], customizationSummary: 'Tyron · Crispy', addedFrom: 'menu', type: 'combo',
        _comboUnits: [{ menuItemId: String(BURGER), itemName: 'Tyron' }, { menuItemId: String(FRIES), itemName: 'Crispy' }],
      }],
    }), P)
    expect(res.status).toBe(201)
    const { order } = await res.json()
    expect(order.items.map((i: any) => [i.name, i.subtotal])).toEqual([['DOS BESTIAS', 1_700_000], ['Tyron', 0], ['Crispy', 0]])
  }
  const { loadComboReport } = await import('@/lib/combos/report')
  const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10)
  const rep = await loadComboReport(String(combo.tenantId), String(location._id), { from: day(-2), to: day(1) })
  expect(rep.combos[0]).toMatchObject({ name: 'DOS BESTIAS', units: 2, orders: 2, revenue: 3_400_000 })
})
