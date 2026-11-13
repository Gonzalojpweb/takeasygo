import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import bcrypt from 'bcryptjs'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import User from '@/models/User'
import AuditLog from '@/models/AuditLog'
import { signJwt } from '@takeasygo/business/jwt'
import { posPinLookup } from '@takeasygo/business/pos-pin'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

import { POST as discard } from '@/app/api/[tenant]/pos/offline/discards/route'

/**
 * POS offline V2 — etapa 6 (12/11/2026): descartar operaciones hechas sin
 * internet pide el PIN de un encargado y queda en la auditoría.
 */

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'offline-discards'
const PEPPER = 'pepper-de-prueba-1234567890'
const MANAGER_PIN = '482913'

let tenantId: string
let locationId: string

function req(body: unknown, opts: { role?: string; pin?: string } = {}): NextRequest {
  const token = signJwt({ sub: '64b0000000000000000000a1', tenantId, role: opts.role ?? 'cashier', deviceType: 'hub' }, PRIVATE_PEM)
  const headers: Record<string, string> = { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-location-id': locationId, 'x-pos-device-id': 'device-caja-0001' }
  if (opts.pin) headers['x-manager-pin'] = opts.pin
  return new Request(`http://localhost:3000/api/${SLUG}/pos/offline/discards`, { method: 'POST', headers, body: JSON.stringify(body) }) as unknown as NextRequest
}
const p = { params: Promise.resolve({ tenant: SLUG }) } as never

const body = {
  reason: 'La cobró otra caja',
  ops: [{ opId: 'op-ronda-0001', kind: 'order.write', label: 'Mesa 5 · ronda a cocina', method: 'POST', path: '/orders', occurredAt: '2026-11-12T20:00:00.000Z', error: 'conflict: La mesa ya tiene otra orden' }],
}

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  process.env.POS_PIN_PEPPER = PEPPER
  __resetPosJwtKeyCacheForTests()
})
afterAll(() => {
  delete process.env.POS_PIN_PEPPER
})

beforeEach(async () => {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  tenantId = (await Tenant.create({ name: 'Descartes', slug: SLUG, plan: 'full' }))._id.toString()
  locationId = (await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'Calle 1', isActive: true }))._id.toString()
  await User.create({
    name: 'Encargada Ana',
    email: `ana-${Math.random().toString(36).slice(2)}@test.com`,
    password: 'x-secret-123',
    phone: `+54${Math.floor(Math.random() * 1e10)}`,
    role: 'manager',
    tenantId,
    isActive: true,
    pin: await bcrypt.hash(MANAGER_PIN, 4),
    posPinLookup: posPinLookup(PEPPER, tenantId, MANAGER_PIN),
  })
})

describe('descartar operaciones sin internet', () => {
  it('un cajero necesita el PIN del encargado', async () => {
    const res = await discard(req(body), p)
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('approval_required')
    expect(await AuditLog.countDocuments({ tenantId, action: 'pos.offline.ops_discarded' })).toBe(0)
  })

  it('con el PIN queda en la auditoría qué se descartó, desde qué equipo y por qué', async () => {
    const res = await discard(req(body, { pin: MANAGER_PIN }), p)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ discarded: 1, approverName: 'Encargada Ana' })
    const log = await AuditLog.findOne({ tenantId, action: 'pos.offline.ops_discarded' }).lean<{ details: Record<string, unknown> }>()
    expect(log!.details).toMatchObject({ deviceId: 'device-caja-0001', reason: 'La cobró otra caja', viaPin: true, ops: [{ opId: 'op-ronda-0001', error: 'conflict: La mesa ya tiene otra orden' }] })
  })

  it('valida lo que llega', async () => {
    expect((await discard(req({ ops: [] }, { role: 'manager' }), p)).status).toBe(400)
    expect((await discard(req({ ops: [{ opId: 'x' }] }, { role: 'manager' }), p)).status).toBe(400)
  })
})
