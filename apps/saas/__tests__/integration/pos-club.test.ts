import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import LoyaltyMember from '@/models/LoyaltyMember'
import StoreItem from '@/models/StoreItem'
import StoreRedemption from '@/models/StoreRedemption'
import { hashPhone } from '@/lib/crypto'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

import { GET as clubGet } from '@/app/api/[tenant]/pos/club/route'
import { POST as claimPost } from '@/app/api/[tenant]/pos/club/redemptions/[id]/route'

/**
 * Fase 4 (29/10/2026) — Clientes › Club en el POS: socio por celular (hash),
 * canjes de la sede sin exponer el código, y entrega con código, una sola vez.
 */

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'cafe-demo'
const BASE = `http://localhost:3000/api/${SLUG}/pos/club`
const PHONE = '+54 9 11 3333-4444'
let tenantId: string
let locationId: string
let memberId: mongoose.Types.ObjectId
let itemId: mongoose.Types.ObjectId

function req(url: string, role = 'cashier', body?: unknown): NextRequest {
  const token = signJwt({ sub: '64b0000000000000000000a1', tenantId, role, deviceType: role === 'waiter' ? 'handheld' : 'hub' }, PRIVATE_PEM)
  return new Request(url, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-location-id': locationId }, body: body === undefined ? undefined : JSON.stringify(body) }) as unknown as NextRequest
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
  memberId = (await LoyaltyMember.create({ tenantId, locationId: loc._id, name: 'María Gómez', phone: PHONE, phoneHash: hashPhone(PHONE), status: 'active', loyalty: { points: 420, tier: 'silver' } }))._id
  itemId = (await StoreItem.create({ tenantId, name: 'Café gratis', category: 'food', description: 'Un café', imageUrl: 'https://example.com/c.jpg', pointsCost: 100, cashValue: 2000, isActive: true }))._id
})

async function redemption(extra: Record<string, unknown> = {}) {
  return StoreRedemption.create({ tenantId, memberId, storeItemId: itemId, pointsUsed: 100, ...extra })
}

describe('Clientes › Club', () => {
  it('busca al socio por celular (cualquier formato) y lista los canjes sin el código', async () => {
    const r = await redemption()
    const res = await (await clubGet(req(`${BASE}?phone=${encodeURIComponent('11 3333 4444')}`), P)).json()
    expect(res.member).toMatchObject({ name: 'María Gómez', points: 420, tier: 'silver' })
    expect(res.redemptions).toHaveLength(1)
    expect(res.redemptions[0]).toMatchObject({ item: 'Café gratis', pointsUsed: 100 })
    expect(JSON.stringify(res)).not.toContain(r.redemptionCode)
    expect(JSON.stringify(res)).not.toContain('3333')
  })

  it('un celular que no es socio devuelve member null; un número corto es 400', async () => {
    expect((await (await clubGet(req(`${BASE}?phone=1199998888`), P)).json()).member).toBeNull()
    expect((await clubGet(req(`${BASE}?phone=123`), P)).status).toBe(400)
  })

  it('entregar exige el código correcto y solo una vez', async () => {
    const r = await redemption()
    expect((await claimPost(req(`${BASE}/redemptions/${r._id}`, 'cashier', { code: 'XXXXXX' }), IP(String(r._id)))).status).toBe(400)
    const ok = await claimPost(req(`${BASE}/redemptions/${r._id}`, 'cashier', { code: r.redemptionCode.toLowerCase() }), IP(String(r._id)))
    expect(ok.status).toBe(200)
    const stored = await StoreRedemption.findById(r._id).lean<{ status: string; locationId: mongoose.Types.ObjectId }>()
    expect(stored).toMatchObject({ status: 'claimed' })
    expect(String(stored!.locationId)).toBe(locationId)
    expect((await claimPost(req(`${BASE}/redemptions/${r._id}`, 'cashier', { code: r.redemptionCode }), IP(String(r._id)))).status).toBe(409)
  })

  it('no entrega canjes de otra sede ni canjes vencidos', async () => {
    const other = await redemption({ locationId: new mongoose.Types.ObjectId() })
    expect((await claimPost(req(`${BASE}/redemptions/${other._id}`, 'cashier', { code: other.redemptionCode }), IP(String(other._id)))).status).toBe(404)
    const expired = await redemption()
    await StoreRedemption.updateOne({ _id: expired._id }, { $set: { expiresAt: new Date(Date.now() - 60_000) } })
    expect((await claimPost(req(`${BASE}/redemptions/${expired._id}`, 'cashier', { code: expired.redemptionCode }), IP(String(expired._id)))).status).toBe(409)
  })

  it('el mozo no consulta el club', async () => {
    expect((await clubGet(req(`${BASE}?phone=1133334444`, 'waiter'), P)).status).toBe(403)
  })
})
