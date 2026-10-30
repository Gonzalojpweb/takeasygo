import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import User from '@/models/User'
import Table from '@/models/Table'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

import { POST as tablesPost } from '@/app/api/[tenant]/pos/tables/route'
import { PATCH as tablePatch } from '@/app/api/[tenant]/pos/tables/[id]/route'
import { toPosOrder, toSaasOrder } from '@/lib/pos-online/orderMapper'

/**
 * 30/10 — en la mesa: quién la atiende (sale del token, no del cliente) y
 * cuándo se comandó cada ronda (sentToKitchenAt).
 */

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'cafe-demo'
const BASE = `http://localhost:3000/api/${SLUG}/pos`
let tenantId: string
let locationId: string
let waiterId: string

function req(url: string, body: unknown, as: { id: string; role: string }, method = 'POST'): NextRequest {
  const token = signJwt({ sub: as.id, tenantId, role: as.role, deviceType: as.role === 'waiter' ? 'handheld' : 'hub' }, PRIVATE_PEM)
  return new Request(url, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-location-id': locationId }, body: JSON.stringify(body) }) as unknown as NextRequest
}
const P = { params: Promise.resolve({ tenant: SLUG }) }
const IP = (id: string) => ({ params: Promise.resolve({ tenant: SLUG, id }) })

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  const tenant = await Tenant.create({ name: 'Café Demo', slug: SLUG, plan: 'full', features: { posEnabled: true } })
  tenantId = tenant._id.toString()
  const loc = await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'Av. Demo 1', isActive: true })
  locationId = loc._id.toString()
  waiterId = (await User.create({ name: 'Juan Pérez', email: 'juan@cafedemo.test', phone: '+5491100000011', role: 'waiter', tenantId, isActive: true }))._id.toString()
})

async function newTable(): Promise<string> {
  const res = await tablesPost(req(`${BASE}/tables`, { id: crypto.randomUUID(), number: 7, capacity: 4 }, { id: waiterId, role: 'manager' }), P)
  return (await res.json()).table.id
}

describe('mesa: quién atiende', () => {
  it('el mozo sale del token aunque el cliente mande otro valor, y se borra al liberar', async () => {
    const id = await newTable()
    const res = await tablePatch(req(`${BASE}/tables/${id}`, { status: 'occupied', serverId: 'counter', guests: 2 }, { id: waiterId, role: 'waiter' }, 'PATCH'), IP(id))
    expect(res.status).toBe(200)
    expect((await res.json()).table).toMatchObject({ serverId: waiterId, serverName: 'Juan Pérez' })

    const released = await tablePatch(req(`${BASE}/tables/${id}`, { status: 'free' }, { id: waiterId, role: 'manager' }, 'PATCH'), IP(id))
    expect(released.status).toBe(200)
    const stored = await Table.findOne({ posId: id }).lean<{ serverId: string | null; serverName: string | null }>()
    expect(stored).toMatchObject({ serverId: null, serverName: null })
  })
})

describe('orden: hora de comanda', () => {
  it('crear ya comandada guarda la hora; pendiente no; el POS la recibe como sentToKitchenAt', () => {
    const ctx = { tenantId: tenantId, locationId: locationId, tenantSlug: SLUG }
    const item = { productId: '64b0000000000000000000ff', name: 'Café', quantity: 1, unitPrice: 100_000, total: 100_000 }
    const confirmed = toSaasOrder({ id: 'o1', items: [item], status: 'confirmed' } as never, ctx as never)
    expect(confirmed.statusTimestamps?.confirmedAt).toBeInstanceOf(Date)
    const pending = toSaasOrder({ id: 'o2', items: [item] } as never, ctx as never)
    expect(pending.statusTimestamps).toBeUndefined()

    const at = new Date('2026-10-30T20:15:00Z')
    const view = toPosOrder({ posId: 'o1', tenantId, source: 'pos', status: 'confirmed', items: [], total: 0, statusTimestamps: { confirmedAt: at }, createdAt: at, updatedAt: at } as never)
    expect(view.sentToKitchenAt).toEqual(at)
  })
})
