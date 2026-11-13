import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import User from '@/models/User'
import Order from '@/models/Order'
import AuditLog from '@/models/AuditLog'
import PosOfflineDevice from '@/models/PosOfflineDevice'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

import { POST as createOrder } from '@/app/api/[tenant]/pos/orders/route'
import { POST as discount } from '@/app/api/[tenant]/pos/orders/[id]/discounts/route'

/**
 * POS offline V2 — etapa 7 (12/11/2026): el PIN del encargado verificado SIN
 * internet en el equipo vale al reenviar (X-Pos-Offline-Approver), solo desde
 * un equipo habilitado y si ese usuario sigue siendo encargado de la sede.
 */

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'offline-approval'
const PIZZA = '64b0000000000000000000c1'
const DEVICE = 'device-caja-0001'

let tenantId: string
let locationId: string
let managerId: string
let cashierId: string

function req(url: string, body: unknown, headers: Record<string, string> = {}): NextRequest {
  // Lo reenvía el cajero que está con internet (no el que aprobó).
  const token = signJwt({ sub: '64b0000000000000000000a9', tenantId, role: 'cashier', deviceType: 'hub' }, PRIVATE_PEM)
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-location-id': locationId, ...headers },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}
const base = `http://localhost:3000/api/${SLUG}/pos/orders`
const p = (id?: string) => ({ params: Promise.resolve(id ? { tenant: SLUG, id } : { tenant: SLUG }) }) as never
const offline = (approver?: string, device = DEVICE) => ({
  'x-pos-op-id': crypto.randomUUID(),
  'x-pos-occurred-at': new Date(Date.now() - 60_000).toISOString(),
  'x-pos-device-id': device,
  ...(approver ? { 'x-pos-offline-approver': approver } : {}),
})

async function user(role: string, name: string) {
  return String((await User.create({ name, email: `${name}-${Math.random().toString(36).slice(2)}@test.com`, password: 'x-secret-123', phone: `+54${Math.floor(Math.random() * 1e10)}`, role, tenantId, isActive: true }))._id)
}

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  tenantId = (await Tenant.create({ name: 'Aprobación', slug: SLUG, plan: 'full' }))._id.toString()
  locationId = (await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'Calle 1', isActive: true }))._id.toString()
  await Menu.create({ tenantId, locationId, isActive: true, categories: [{ name: 'Cocina', sortOrder: 0, items: [{ _id: PIZZA, name: 'Pizza', price: 10000 }] }] })
  await PosOfflineDevice.create({ tenantId, locationId, deviceId: DEVICE, name: 'Caja', role: 'primary' })
  managerId = await user('manager', 'ana')
  cashierId = await user('cashier', 'luis')
})

async function newOrder() {
  const posId = crypto.randomUUID()
  const res = await createOrder(req(base, { id: posId, items: [{ productId: PIZZA, name: 'Pizza', quantity: 1, unitPrice: 10000, total: 10000 }] }), p())
  expect(res.status).toBe(201)
  return posId
}
const tenPercent = { kind: 'percent', value: 10, reason: 'courtesy' }

describe('aprobación del encargado hecha sin internet', () => {
  it('desde el equipo habilitado vale: descuento aplicado y auditoría marcada sin internet', async () => {
    const posId = await newOrder()
    const res = await discount(req(`${base}/${posId}/discounts`, tenPercent, offline(managerId)), p(posId))
    expect(res.status).toBe(200)
    expect((await Order.findOne({ tenantId, posId }).lean<{ total: number }>())!.total).toBe(9000)
    const log = await AuditLog.findOne({ tenantId, action: 'pos.approval.granted' }).lean<{ entityId: string; details: Record<string, unknown> }>()
    expect(log).toMatchObject({ entityId: managerId, details: { offline: true, deviceId: DEVICE, action: 'order.discount' } })
  })

  it('desde un equipo no habilitado no vale', async () => {
    const posId = await newOrder()
    const res = await discount(req(`${base}/${posId}/discounts`, tenPercent, offline(managerId, 'device-otro-9999')), p(posId))
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('approval_invalid')
  })

  it('si quien «aprobó» no es encargado, no vale', async () => {
    const posId = await newOrder()
    const res = await discount(req(`${base}/${posId}/discounts`, tenPercent, offline(cashierId)), p(posId))
    expect(res.status).toBe(403)
    expect(await AuditLog.countDocuments({ tenantId, action: 'pos.approval.denied' })).toBe(1)
  })

  it('sin el header de aprobación sigue pidiendo el PIN (como siempre)', async () => {
    const posId = await newOrder()
    const res = await discount(req(`${base}/${posId}/discounts`, tenPercent, offline()), p(posId))
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('approval_required')
  })
})
