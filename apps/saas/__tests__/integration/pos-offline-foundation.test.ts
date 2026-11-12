import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import User from '@/models/User'
import Table from '@/models/Table'
import PosOpReceipt from '@/models/PosOpReceipt'
import PosOfflineDevice from '@/models/PosOfflineDevice'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

import { POST as tablesPost } from '@/app/api/[tenant]/pos/tables/route'
import { PATCH as tablePatch } from '@/app/api/[tenant]/pos/tables/[id]/route'
import { GET as devicesGet, POST as devicesPost, DELETE as devicesDelete } from '@/app/api/[tenant]/pos/offline/devices/route'

/**
 * POS offline V2 — etapa 1 (12/11/2026):
 *   · una operación con X-Pos-Op-Id se aplica UNA sola vez (reenvío = misma respuesta)
 *   · un error no deja recibo: se puede reintentar
 *   · equipos habilitados sin internet con tope por plan
 */

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'cafe-offline'
const BASE = `http://localhost:3000/api/${SLUG}/pos`
let tenantId: string
let locationId: string
let managerId: string

function req(
  url: string,
  body: unknown,
  opts: { role?: string; method?: string; headers?: Record<string, string> } = {}
): NextRequest {
  const role = opts.role ?? 'manager'
  const token = signJwt({ sub: managerId, tenantId, role, deviceType: 'hub' }, PRIVATE_PEM)
  return new Request(url, {
    method: opts.method ?? 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-location-id': locationId, ...(opts.headers ?? {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest
}
const P = { params: Promise.resolve({ tenant: SLUG }) }
const IP = (id: string) => ({ params: Promise.resolve({ tenant: SLUG, id }) })

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

async function setup(plan: string) {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  const tenant = await Tenant.create({ name: 'Café Offline', slug: SLUG, plan, features: { posEnabled: true } })
  tenantId = tenant._id.toString()
  const loc = await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'Av. Demo 1', isActive: true })
  locationId = loc._id.toString()
  managerId = (await User.create({ name: 'Ana', email: 'ana@offline.test', phone: '+5491100000099', role: 'manager', tenantId, isActive: true }))._id.toString()
}

describe('operación offline: se aplica una sola vez', () => {
  beforeEach(() => setup('full'))

  it('el reenvío del mismo opId devuelve la misma respuesta sin volver a aplicar', async () => {
    const opId = crypto.randomUUID()
    const tableId = crypto.randomUUID()
    const headers = { 'x-pos-op-id': opId, 'x-pos-occurred-at': new Date(Date.now() - 60_000).toISOString(), 'x-pos-device-id': 'dev-12345678' }
    const first = await tablesPost(req(`${BASE}/tables`, { id: tableId, number: 3, capacity: 4 }, { headers }), P)
    expect(first.status).toBe(201)
    const firstBody = await first.json()

    const occupy = { status: 'occupied', serverId: 'x', guests: 2 }
    const occOp = { ...headers, 'x-pos-op-id': crypto.randomUUID() }
    const a = await tablePatch(req(`${BASE}/tables/${tableId}`, occupy, { method: 'PATCH', headers: occOp }), IP(tableId))
    expect(a.status).toBe(200)
    const aBody = await a.json()
    // Reenvío idéntico: sin el recibo, ocupar una mesa ya ocupada se volvería a aplicar.
    const b = await tablePatch(req(`${BASE}/tables/${tableId}`, occupy, { method: 'PATCH', headers: occOp }), IP(tableId))
    expect(b.status).toBe(200)
    expect(b.headers.get('x-pos-op-replayed')).toBe('1')
    expect(await b.json()).toEqual(aBody)

    const replayCreate = await tablesPost(req(`${BASE}/tables`, { id: tableId, number: 3, capacity: 4 }, { headers }), P)
    expect(replayCreate.headers.get('x-pos-op-replayed')).toBe('1')
    expect((await replayCreate.json()).table.id).toBe(firstBody.table.id)
    expect(await Table.countDocuments({ posId: tableId })).toBe(1)

    const receipt = await PosOpReceipt.findOne({ opId }).lean()
    expect(receipt).toMatchObject({ status: 'done', responseStatus: 201, deviceId: 'dev-12345678' })
    expect(receipt?.occurredAt).toBeInstanceOf(Date)
  })

  it('un error no deja recibo: la operación se puede reintentar', async () => {
    const opId = crypto.randomUUID()
    const bad = await tablesPost(req(`${BASE}/tables`, { id: crypto.randomUUID(), number: -1, capacity: 4 }, { headers: { 'x-pos-op-id': opId } }), P)
    expect(bad.status).toBe(400)
    expect(await PosOpReceipt.countDocuments({ opId })).toBe(0)
  })

  it('un opId mal formado es 400 y sin header todo sigue igual que hoy', async () => {
    const bad = await tablesPost(req(`${BASE}/tables`, { id: crypto.randomUUID(), number: 4, capacity: 2 }, { headers: { 'x-pos-op-id': 'a b' } }), P)
    expect(bad.status).toBe(400)
    const plain = await tablesPost(req(`${BASE}/tables`, { id: crypto.randomUUID(), number: 5, capacity: 2 }), P)
    expect(plain.status).toBe(201)
    expect(await PosOpReceipt.countDocuments({})).toBe(0)
  })
})

describe('equipos sin internet: tope por plan', () => {
  it('Premium: dos equipos (principal y secundario); el tercero no entra', async () => {
    await setup('full')
    const r1 = await devicesPost(req(`${BASE}/offline/devices`, { deviceId: 'device-aaaa1111', name: 'Caja' }), P)
    expect(r1.status).toBe(201)
    expect((await r1.json()).device.role).toBe('primary')
    const r2 = await devicesPost(req(`${BASE}/offline/devices`, { deviceId: 'device-bbbb2222', name: 'Barra' }), P)
    expect((await r2.json()).device.role).toBe('secondary')
    const r3 = await devicesPost(req(`${BASE}/offline/devices`, { deviceId: 'device-cccc3333', name: 'Extra' }), P)
    expect(r3.status).toBe(409)

    const status = await devicesGet(req(`${BASE}/offline/devices`, undefined, { method: 'GET', role: 'cashier', headers: { 'x-pos-device-id': 'device-bbbb2222' } }), P)
    const body = await status.json()
    expect(body.limit).toBe(2)
    expect(body.thisDevice).toMatchObject({ enabled: true, role: 'secondary' })

    // Revocar el principal: el secundario pasa a principal y se libera un lugar.
    const del = await devicesDelete(req(`${BASE}/offline/devices?deviceId=device-aaaa1111`, undefined, { method: 'DELETE' }), P)
    expect(del.status).toBe(200)
    expect((await PosOfflineDevice.findOne({ deviceId: 'device-bbbb2222' }).lean())?.role).toBe('primary')
    const r4 = await devicesPost(req(`${BASE}/offline/devices`, { deviceId: 'device-cccc3333', name: 'Extra' }), P)
    expect(r4.status).toBe(201)
  })

  it('Crecimiento: un solo equipo; el cajero no puede habilitar', async () => {
    await setup('buy')
    const denied = await devicesPost(req(`${BASE}/offline/devices`, { deviceId: 'device-aaaa1111', name: 'Caja' }, { role: 'cashier' }), P)
    expect(denied.status).toBe(403)
    expect((await devicesPost(req(`${BASE}/offline/devices`, { deviceId: 'device-aaaa1111', name: 'Caja' }), P)).status).toBe(201)
    // Volver a habilitar el mismo equipo no ocupa otro lugar.
    expect((await devicesPost(req(`${BASE}/offline/devices`, { deviceId: 'device-aaaa1111', name: 'Caja' }), P)).status).toBe(200)
    expect((await devicesPost(req(`${BASE}/offline/devices`, { deviceId: 'device-bbbb2222', name: 'Otra' }), P)).status).toBe(409)
  })
})
