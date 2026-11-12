import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Table from '@/models/Table'
import Order from '@/models/Order'
import Menu from '@/models/Menu'
import PosOfflineDevice from '@/models/PosOfflineDevice'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

import { POST as createOrder } from '@/app/api/[tenant]/pos/orders/route'
import { PATCH as patchOrder } from '@/app/api/[tenant]/pos/orders/[id]/route'

/**
 * POS offline V2 — etapa 2 (12/11/2026): rondas tomadas sin internet.
 *   · Desde un equipo HABILITADO: se guarda con la hora real y con el precio
 *     de ese momento (la carta pudo cambiar antes de que volviera la red).
 *   · Desde un equipo NO habilitado: como cualquier petición (hora del server
 *     y validación contra la carta).
 */

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'offline-orders'
const PIZZA = '64b0000000000000000000c1'
const DEVICE = 'device-caja-0001'

let tenantId: string
let locationId: string
let tablePosId: string

function req(url: string, body: unknown, headers: Record<string, string> = {}, method = 'POST'): NextRequest {
  const token = signJwt({ sub: '64b0000000000000000000a1', tenantId, role: 'cashier', deviceType: 'hub' }, PRIVATE_PEM)
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-location-id': locationId, ...headers },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}
const base = `http://localhost:3000/api/${SLUG}/pos/orders`
const p = (id?: string) => ({ params: Promise.resolve(id ? { tenant: SLUG, id } : { tenant: SLUG }) }) as never

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  const tenant = await Tenant.create({ name: 'Offline', slug: SLUG, plan: 'full' })
  tenantId = tenant._id.toString()
  const loc = await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'Calle 1', isActive: true })
  locationId = loc._id.toString()
  tablePosId = (await Table.create({ tenantId, locationId, posId: crypto.randomUUID(), number: 4, capacity: 4, status: 'occupied' })).posId
  // La carta YA subió de precio: la pizza costaba 9000 cuando se tomó el pedido.
  await Menu.create({ tenantId, locationId, isActive: true, categories: [{ name: 'Cocina', sortOrder: 0, items: [{ _id: PIZZA, name: 'Pizza', price: 10000 }] }] })
})

const round = (status = 'confirmed') => ({
  id: crypto.randomUUID(),
  tableId: tablePosId,
  status,
  items: [{ productId: PIZZA, name: 'Pizza', quantity: 2, unitPrice: 9000, total: 18000 }],
})

describe('ronda tomada sin internet', () => {
  it('equipo habilitado: hora real y precio de ese momento', async () => {
    await PosOfflineDevice.create({ tenantId, locationId, deviceId: DEVICE, name: 'Caja', role: 'primary' })
    const at = new Date(Date.now() - 3 * 60 * 60 * 1000) // hace 3 h
    const body = round()
    const res = await createOrder(req(base, body, { 'x-pos-op-id': crypto.randomUUID(), 'x-pos-occurred-at': at.toISOString(), 'x-pos-device-id': DEVICE }), p())
    expect(res.status).toBe(201)
    const saved = await Order.findOne({ tenantId, posId: body.id }).lean<{ createdAt: Date; total: number; statusTimestamps?: { confirmedAt?: Date } }>()
    expect(saved!.total).toBe(18000)
    expect(saved!.createdAt.getTime()).toBe(at.getTime())
    expect(saved!.statusTimestamps?.confirmedAt?.getTime()).toBe(at.getTime())

    // Entregada sin internet 1 h después: la hora de entrega también es la real.
    const deliveredAt = new Date(at.getTime() + 60 * 60 * 1000)
    const steps = ['preparing', 'ready', 'delivered']
    for (const status of steps) {
      const r = await patchOrder(req(`${base}/${body.id}`, { status }, { 'x-pos-op-id': crypto.randomUUID(), 'x-pos-occurred-at': deliveredAt.toISOString(), 'x-pos-device-id': DEVICE }, 'PATCH'), p(body.id))
      expect(r.status).toBe(200)
    }
    const done = await Order.findOne({ tenantId, posId: body.id }).lean<{ statusTimestamps?: { deliveredAt?: Date } }>()
    expect(done!.statusTimestamps?.deliveredAt?.getTime()).toBe(deliveredAt.getTime())
  })

  it('equipo NO habilitado: se valida contra la carta vigente como siempre', async () => {
    const at = new Date(Date.now() - 60 * 60 * 1000)
    const res = await createOrder(req(base, round(), { 'x-pos-op-id': crypto.randomUUID(), 'x-pos-occurred-at': at.toISOString(), 'x-pos-device-id': 'device-intruso-01' }), p())
    expect(res.status).toBe(409) // el precio no coincide con la carta vigente
    expect(await Order.countDocuments({ tenantId })).toBe(0)
  })

  it('equipo revocado: tampoco', async () => {
    await PosOfflineDevice.create({ tenantId, locationId, deviceId: DEVICE, name: 'Caja', role: 'primary', revokedAt: new Date() })
    const res = await createOrder(req(base, round(), { 'x-pos-op-id': crypto.randomUUID(), 'x-pos-occurred-at': new Date().toISOString(), 'x-pos-device-id': DEVICE }), p())
    expect(res.status).toBe(409) // el precio no coincide con la carta vigente
    expect(await Order.countDocuments({ tenantId })).toBe(0)
  })
})
