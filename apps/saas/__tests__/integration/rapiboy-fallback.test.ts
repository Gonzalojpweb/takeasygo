// ============================================================================
// rapiboy-fallback.test.ts — fallas de Rapiboy antes del viaje (26/11/2026)
// ============================================================================
// Antes: si Rapiboy fallaba al pasar a «Listo» (o la sede no tenía
// coordenadas), el pedido pasaba a reparto propio en silencio y se borraba la
// cotización; si el cliente rechazaba el precio nuevo, el local no se enteraba.
// Ahora: se conserva la cotización con el motivo y se avisa al local. No se
// toca el webhook ni las credenciales de la sede.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import type { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'admin-id', role: 'superadmin', tenantSlug: 'rb-tenant' } }),
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'admin-id', role: 'superadmin' } }),
  getSessionUser: vi.fn().mockReturnValue({ id: 'admin-id', role: 'superadmin' }),
}))
vi.mock('@/lib/push', () => ({ sendAdminPushNotification: vi.fn().mockResolvedValue(undefined), sendPushToSubscription: vi.fn() }))
vi.mock('@/lib/sync-layer', () => ({
  pushOrderToSyncLayer: vi.fn().mockResolvedValue(undefined),
  confirmOrderPaymentCore: vi.fn().mockResolvedValue(undefined),
  notifySyncLayerStatus: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('web-push', () => {
  const mock = { setVapidDetails: vi.fn(), sendNotification: vi.fn() }
  return { __esModule: true, default: mock, setVapidDetails: vi.fn(), sendNotification: vi.fn() }
})
vi.mock('@/lib/hooks/useEstimatedTimeAdjustment', () => ({ triggerBackgroundAdjustment: vi.fn() }))
vi.mock('@/lib/events', () => ({ captureOrderStatusChanged: vi.fn() }))

// Rapiboy no responde al recotizar (la credencial real nunca se usa).
const recotizar = vi.fn()
vi.mock('@/lib/delivery/cotizar', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/delivery/cotizar')>()
  return { ...orig, recotizarParaReady: (...a: unknown[]) => recotizar(...a) }
})

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'
import SystemAnnouncement from '@/models/SystemAnnouncement'
import { RapiboyError } from '@/lib/rapiboy/client'
import { notifyQuoteRejected } from '@/lib/rapiboy/trips'
import { PATCH as statusPATCH } from '@/app/api/[tenant]/orders/[orderId]/status/route'

const SLUG = 'rb-tenant'
let tenant: any
let location: any

const statusReq = (orderId: string, body: object) => new Request(`http://localhost:3000/api/${SLUG}/orders/${orderId}/status`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) as unknown as NextRequest
const statusParams = (orderId: string) => ({ params: Promise.resolve({ tenant: SLUG, orderId }) })

function rapiboyOrder(over: Record<string, unknown> = {}) {
  return Order.create({
    tenantId: tenant._id,
    locationId: location._id,
    orderNumber: `RB-${Math.floor(Math.random() * 1e6)}`,
    status: 'preparing',
    orderMode: 'delivery',
    items: [{ menuItemId: new mongoose.Types.ObjectId(), name: 'Pizza', price: 1_000_000, basePrice: 1_000_000, extraPrice: 0, quantity: 1, subtotal: 1_000_000, categoryName: 'Pizzas', description: '' }],
    subtotal: 1_000_000,
    total: 1_330_000,
    deliveryCost: 330_000,
    customer: { name: 'Cliente', phone: '' },
    deliveryAddress: { street: 'Calle', number: '123', city: 'Ciudad', coordinates: { lat: -34.6, lng: -58.4 } },
    payment: { method: 'mercadopago', status: 'approved', baseTotal: 1_330_000, surchargeAmount: 0 },
    deliveryProvider: { type: 'rapiboy', rapiboy: { tripId: '', trackingId: '', trackingUrl: '', quotedCost: 300_000, chargedToCustomer: 330_000, margin: 30_000, environment: 'uat', checkoutCost: 300_000, checkoutQuoteTimestamp: new Date(), transferBuffer: 0, quoteStatus: 'none', pendingQuoteCost: 0, pendingQuoteTimestamp: null } },
    printJobs: [],
    ...over,
  })
}

beforeEach(async () => {
  recotizar.mockReset()
  tenant = await Tenant.create({ name: 'RB', slug: SLUG, plan: 'full', status: 'active' })
  location = await Location.create({
    tenantId: tenant._id, name: 'Centro', slug: 'centro', address: 'Av. 1', isActive: true,
    geo: { type: 'Point', coordinates: [-58.38, -34.6] },
    // Solo para el test: nunca se llama a Rapiboy (recotizar está simulado).
    rapiboyConfig: { enabled: true, apiToken: 'iv:tag:cifrado', environment: 'uat', margen: 10, codigoPlataforma: 'TGO', webhookSecret: '', transferBufferPercentage: 1.5 },
  })
})

describe('Rapiboy no toma el envío al pasar a «Listo»', () => {
  it('error de Rapiboy: reparto propio con la cotización conservada, motivo y aviso al local', async () => {
    recotizar.mockRejectedValue(new RapiboyError('timeout', 0, 'TIMEOUT'))
    const order = await rapiboyOrder()
    const res = await statusPATCH(statusReq(String(order._id), { status: 'ready' }), statusParams(String(order._id)))
    expect(res.status).toBe(200)
    const after = await Order.findById(order._id).lean() as any
    expect(after.status).toBe('ready')
    expect(after.deliveryProvider.type).toBe('own')
    expect(after.deliveryProvider.rapiboy).toMatchObject({ checkoutCost: 300_000, chargedToCustomer: 330_000, fallbackReason: 'Rapiboy no respondió' })
    expect(after.deliveryProvider.rapiboy.fallbackAt).toBeTruthy()
    expect(after.deliveryConfirmation?.customerCode?.code).toMatch(/^\d{6}$/)
    const notes = await SystemAnnouncement.find({ targetTenantIds: tenant._id }).lean() as any[]
    expect(notes.some(n => /Rapiboy no tomó el envío/.test(n.title))).toBe(true)
  })

  it('sede sin coordenadas en un pedido cotizado con Rapiboy: también avisa', async () => {
    await Location.updateOne({ _id: location._id }, { $unset: { geo: 1 } })
    const order = await rapiboyOrder()
    await statusPATCH(statusReq(String(order._id), { status: 'ready' }), statusParams(String(order._id)))
    const after = await Order.findById(order._id).lean() as any
    expect(after.deliveryProvider.type).toBe('own')
    expect(after.deliveryProvider.rapiboy.fallbackReason).toMatch(/ubicación en el mapa/)
    expect(recotizar).not.toHaveBeenCalled()
    expect(await SystemAnnouncement.countDocuments({ targetTenantIds: tenant._id })).toBe(1)
  })

  it('un pedido de reparto propio (sin Rapiboy) no genera aviso', async () => {
    const order = await rapiboyOrder({ deliveryProvider: { type: 'own' } })
    await Location.updateOne({ _id: location._id }, { $set: { 'rapiboyConfig.enabled': false } })
    await statusPATCH(statusReq(String(order._id), { status: 'ready' }), statusParams(String(order._id)))
    const after = await Order.findById(order._id).lean() as any
    expect(after.deliveryProvider.type).toBe('own')
    expect(after.deliveryProvider.rapiboy ?? null).toBeNull()
    expect(await SystemAnnouncement.countDocuments({ targetTenantIds: tenant._id })).toBe(0)
  })
})

describe('el cliente rechaza el precio nuevo', () => {
  it('avisa al local una sola vez', async () => {
    const order = await rapiboyOrder()
    await notifyQuoteRejected(order)
    await notifyQuoteRejected(order)
    const notes = await SystemAnnouncement.find({ targetTenantIds: tenant._id }).lean() as any[]
    expect(notes).toHaveLength(1)
    expect(notes[0].title).toMatch(/rechazó el nuevo costo de envío/)
  })
})
