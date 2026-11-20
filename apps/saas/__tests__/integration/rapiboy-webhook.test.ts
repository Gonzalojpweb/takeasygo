// Webhook de Rapiboy (20/11/2026): secreto de la sede DEL PEDIDO, estado
// confirmado con GetQuery, sin retrocesos ni duplicados, viaje fallido avisa
// al local sin cancelar el pedido.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'
import SystemAnnouncement from '@/models/SystemAnnouncement'
import { encrypt } from '@/lib/crypto'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToSubscription: vi.fn().mockResolvedValue(true) }))
vi.mock('@/lib/store-redemptions', () => ({ claimCheckoutRedemptionsForOrder: vi.fn().mockResolvedValue(undefined) }))

const consultarMock = vi.fn()
vi.mock('@/lib/rapiboy/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rapiboy/client')>()),
  consultarViaje: (...args: any[]) => consultarMock(...args),
}))

import { POST as webhook } from '@/app/api/webhooks/rapiboy/[tenant]/route'

const SLUG = 'rb-tenant'
let tenant: any
let locA: any
let locB: any

function call(body: unknown, headers: Record<string, string> = {}, query = '') {
  return webhook(
    new NextRequest(`http://x/api/webhooks/rapiboy/${SLUG}${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ tenant: SLUG }) },
  )
}

async function makeOrder(locationId: any, overrides: Record<string, any> = {}) {
  return Order.create({
    tenantId: tenant._id,
    locationId,
    orderNumber: `RB-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    status: 'ready',
    orderMode: 'delivery',
    items: [{ name: 'Pizza', quantity: 1, basePrice: 1000, extraPrice: 0, price: 1000, subtotal: 1000 }],
    subtotal: 1000,
    total: 1000,
    customer: { name: 'Ana', phone: '+5491100000000' },
    payment: { method: 'mercadopago', status: 'approved', baseTotal: 1000 },
    deliveryProvider: { type: 'rapiboy', rapiboy: { tripId: '900001', estado: 10, phase: 'searching' } },
    ...overrides,
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  // lib/crypto espera la clave en base64 (32 bytes); setup.ts la deja en hex.
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  consultarMock.mockRejectedValue(new Error('sin red'))
  tenant = await Tenant.create({ name: 'RB', slug: SLUG, plan: 'full', status: 'active', isActive: true })
  const cfg = (secret: string, code: string) => ({
    enabled: true, apiToken: encrypt('tok'), environment: 'uat', codigoPlataforma: code, webhookSecret: encrypt(secret),
  })
  locA = await Location.create({ tenantId: tenant._id, name: 'A', slug: 'a', address: 'Calle A 1', rapiboyConfig: cfg('secret-a', 'COD-A') })
  locB = await Location.create({ tenantId: tenant._id, name: 'B', slug: 'b', address: 'Calle B 2', rapiboyConfig: cfg('secret-b', 'COD-B') })
})

describe('webhook Rapiboy — autenticación', () => {
  it('401 sin secreto', async () => {
    await makeOrder(locA._id)
    const res = await call({ IdPedido: 900001, Estado: 12 })
    expect(res.status).toBe(401)
  })

  it('401 con el secreto de OTRA sede del mismo comercio (antes se aceptaba cualquiera)', async () => {
    const order = await makeOrder(locA._id)
    const res = await call({ IdPedido: 900001, Estado: 12 }, { 'x-rapiboy-secret': 'secret-b' })
    expect(res.status).toBe(401)
    expect((await Order.findById(order._id))!.status).toBe('ready')
  })

  it('acepta header, Bearer o ?token=', async () => {
    await makeOrder(locA._id)
    expect((await call({ IdPedido: 900001, Estado: 11 }, { 'x-rapiboy-secret': 'secret-a' })).status).toBe(200)
    expect((await call({ IdPedido: 900001, Estado: 28 }, { authorization: 'Bearer secret-a' })).status).toBe(200)
    expect((await call({ IdPedido: 900001, Estado: 12 }, {}, '?token=secret-a')).status).toBe(200)
  })

  it('sin pedido: autentica por CodigoPlataforma y responde 200', async () => {
    const res = await call({ IdPedido: 1, Estado: 12, CodigoPlataforma: 'COD-B' }, { 'x-rapiboy-secret': 'secret-b' })
    expect(res.status).toBe(200)
    expect((await res.json()).note).toBe('order not found')
  })
})

describe('webhook Rapiboy — estados', () => {
  const H = { 'x-rapiboy-secret': 'secret-a' }

  it('Retirado (12) → pedido en_ruta', async () => {
    const order = await makeOrder(locA._id)
    await call({ IdPedido: 900001, Estado: 12 }, H)
    const fresh = await Order.findById(order._id)
    expect(fresh!.status).toBe('en_ruta')
    expect(fresh!.deliveryProvider!.rapiboy!.phase).toBe('picked_up')
  })

  it('EnCaminoARetirar (11) NO marca el pedido como en camino al cliente', async () => {
    const order = await makeOrder(locA._id)
    await call({ IdPedido: 900001, Estado: 11 }, H)
    const fresh = await Order.findById(order._id)
    expect(fresh!.status).toBe('ready')
    expect(fresh!.deliveryProvider!.rapiboy!.phase).toBe('to_pickup')
  })

  it('confirma con GetQuery: manda el estado de Rapiboy, no el del aviso', async () => {
    const order = await makeOrder(locA._id)
    consultarMock.mockResolvedValue({ idPedido: '900001', estado: 13, estadoNombre: 'Entregado', driverName: 'Carlos', trackingUrl: '', cancelado: false, terminado: true, precio: null })
    await call({ IdPedido: 900001, Estado: 12 }, H)
    const fresh = await Order.findById(order._id)
    expect(fresh!.status).toBe('delivered')
    expect(fresh!.deliveryProvider!.rapiboy!.driverName).toBe('Carlos')
  })

  it('aviso atrasado no hace retroceder un pedido entregado', async () => {
    const order = await makeOrder(locA._id)
    await call({ IdPedido: 900001, Estado: 13 }, H)
    await call({ IdPedido: 900001, Estado: 12 }, H)
    expect((await Order.findById(order._id))!.status).toBe('delivered')
  })

  it('viaje NoEntregado: el pedido sigue abierto y se avisa al local UNA vez', async () => {
    const order = await makeOrder(locA._id, { status: 'en_ruta' })
    await call({ IdPedido: 900001, Estado: 16 }, H)
    await call({ IdPedido: 900001, Estado: 16 }, H)
    const fresh = await Order.findById(order._id)
    expect(fresh!.status).toBe('en_ruta')
    expect(fresh!.deliveryProvider!.rapiboy!.phase).toBe('failed')
    expect(fresh!.deliveryProvider!.rapiboy!.failureNotifiedAt).toBeInstanceOf(Date)
    expect(await SystemAnnouncement.countDocuments({ targetTenantIds: tenant._id })).toBe(1)
  })

  it('pedido de otro comercio con el mismo IdPedido no se toca', async () => {
    const other = await Tenant.create({ name: 'Otro', slug: 'otro', plan: 'full', status: 'active', isActive: true })
    const foreign = await Order.create({
      tenantId: other._id, locationId: locA._id, orderNumber: 'X-1', status: 'ready', orderMode: 'delivery',
      items: [{ name: 'P', quantity: 1, basePrice: 1, extraPrice: 0, price: 1, subtotal: 1 }],
      subtotal: 1, total: 1, customer: { name: 'B', phone: '1' }, payment: { method: 'mercadopago', status: 'approved', baseTotal: 1 },
      deliveryProvider: { type: 'rapiboy', rapiboy: { tripId: '900001' } },
    })
    await call({ IdPedido: 900001, Estado: 13, CodigoPlataforma: 'COD-A' }, H)
    expect((await Order.findById(foreign._id))!.status).toBe('ready')
  })
})
