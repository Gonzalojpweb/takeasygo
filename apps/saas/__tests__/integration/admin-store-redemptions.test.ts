import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import StoreItem from '@/models/StoreItem'
import StoreRedemption from '@/models/StoreRedemption'
import { countPendingRedemptions } from '@/lib/store-redemptions'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

// requireAuth controlable por test
let authError: any = null
vi.mock('@/lib/apiAuth', () => ({
  requireAuth: vi.fn(async () => authError),
  getSessionUser: vi.fn(async () => null),
}))

import { GET as adminList } from '@/app/api/[tenant]/admin/store/redemptions/route'

const SLUG_A = 'tenant-a'
const SLUG_B = 'tenant-b'

function req(url: string) {
  return new NextRequest(`http://localhost${url}`)
}

function params(slug: string) {
  return { params: Promise.resolve({ tenant: slug }) }
}

let tenantA: any
let tenantB: any
let member: any
let item: any

async function makeRedemption(tenant: any, overrides: Record<string, any> = {}) {
  return StoreRedemption.create({
    tenantId: tenant._id,
    memberId: member._id,
    storeItemId: item._id,
    pointsUsed: 100,
    ...overrides,
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  authError = null

  tenantA = await Tenant.create({
    name: 'Tenant A',
    slug: SLUG_A,
    plan: 'full',
    status: 'active',
    isActive: true,
  })
  tenantB = await Tenant.create({
    name: 'Tenant B',
    slug: SLUG_B,
    plan: 'full',
    status: 'active',
    isActive: true,
  })
  member = await LoyaltyMember.create({
    tenantId: tenantA._id,
    name: 'María',
    phone: '+5491133334444',
    status: 'active',
    loyalty: { points: 500 },
  })
  item = await StoreItem.create({
    tenantId: tenantA._id,
    name: 'Cachapa',
    category: 'food',
    description: 'Deliciosa cachapa',
    imageUrl: 'https://example.com/cachapa.jpg',
    pointsCost: 100,
    cashValue: 2000,
    isActive: true,
  })
})

describe('GET /api/{tenant}/admin/store/redemptions', () => {
  it('devuelve 401/403 si requireAuth falla', async () => {
    authError = Response.json({ error: 'No autorizado' }, { status: 401 })

    const res = await adminList(req(`/api/${SLUG_A}/admin/store/redemptions`), params(SLUG_A))
    expect(res.status).toBe(401)
  })

  it('lista solo canjes del tenant de la URL (aislamiento cross-tenant)', async () => {
    await makeRedemption(tenantA)
    await makeRedemption(tenantB, { memberId: member._id, storeItemId: item._id })

    const res = await adminList(req(`/api/${SLUG_A}/admin/store/redemptions`), params(SLUG_A))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.redemptions).toHaveLength(1)
    expect(data.redemptions[0].tenantId).toBe(tenantA._id.toString())
  })

  it('por defecto devuelve solo pending; acepta otros status válidos', async () => {
    await makeRedemption(tenantA, { status: 'pending' })
    await makeRedemption(tenantA, { status: 'claimed' })

    const pendingRes = await adminList(req(`/api/${SLUG_A}/admin/store/redemptions`), params(SLUG_A))
    const pendingData = await pendingRes.json()
    expect(pendingData.redemptions).toHaveLength(1)
    expect(pendingData.redemptions[0].status).toBe('pending')

    const claimedRes = await adminList(
      req(`/api/${SLUG_A}/admin/store/redemptions?status=claimed`),
      params(SLUG_A)
    )
    const claimedData = await claimedRes.json()
    expect(claimedData.redemptions).toHaveLength(1)
    expect(claimedData.redemptions[0].status).toBe('claimed')
  })

  it('rechaza status inválido con 400', async () => {
    const res = await adminList(
      req(`/api/${SLUG_A}/admin/store/redemptions?status=bogus`),
      params(SLUG_A)
    )
    expect(res.status).toBe(400)
  })

  it('puebla nombre del miembro y datos del item', async () => {
    await makeRedemption(tenantA)

    const res = await adminList(req(`/api/${SLUG_A}/admin/store/redemptions`), params(SLUG_A))
    const data = await res.json()
    expect(data.redemptions[0].memberId.name).toBe('María')
    expect(data.redemptions[0].storeItemId.name).toBe('Cachapa')
    expect(data.redemptions[0].storeItemId.pointsCost).toBe(100)
  })

  it('status=pending: SOLO standalone vigentes; excluye checkout y vencidos', async () => {
    // Checkout: vive con el pedido → NO aparece en Solicitudes (se ve en el
    // panel del pedido → sin doble display)
    await makeRedemption(tenantA, { status: 'pending', source: 'checkout', expiresAt: null })
    // Standalone vigente (+24hs por default)
    await makeRedemption(tenantA, { status: 'pending', source: 'standalone' })
    // Vencido sin barrer → no debe aparecer (igual que el badge)
    await makeRedemption(tenantA, {
      status: 'pending',
      source: 'standalone',
      expiresAt: new Date(Date.now() - 1000),
    })

    const res = await adminList(req(`/api/${SLUG_A}/admin/store/redemptions?status=pending`), params(SLUG_A))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.redemptions).toHaveLength(1)
    expect(data.redemptions[0].source).toBe('standalone')
    expect(data.redemptions[0].expiresAt).toBeTruthy()
    expect(new Date(data.redemptions[0].expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('incluye canjes legacy sin source ni orderId (previos al campo source)', async () => {
    // Inserts crudos SIN los defaults del modelo: así estaban en producción.
    // Vigente → debe aparecer en Solicitudes y contar en el badge.
    await StoreRedemption.collection.insertOne({
      tenantId: tenantA._id,
      memberId: member._id,
      storeItemId: item._id,
      pointsUsed: 100,
      status: 'pending',
      redemptionCode: 'TGO-TEST-LGC1',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    // Vencido → no aparece (mismo criterio que los standalone)
    await StoreRedemption.collection.insertOne({
      tenantId: tenantA._id,
      memberId: member._id,
      storeItemId: item._id,
      pointsUsed: 100,
      status: 'pending',
      redemptionCode: 'TGO-TEST-LGC2',
      expiresAt: new Date(Date.now() - 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    expect(await countPendingRedemptions(tenantA._id)).toBe(1)

    const res = await adminList(req(`/api/${SLUG_A}/admin/store/redemptions?status=pending`), params(SLUG_A))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.redemptions).toHaveLength(1)
    expect(data.redemptions[0].source).toBeUndefined()
  })
})

describe('countPendingRedemptions (badge Tienda)', () => {
  it('cuenta pending vigentes, excluye vencidos y otros status', async () => {
    // Vigente (default pre-validate: +24hs)
    await makeRedemption(tenantA, { status: 'pending' })
    // Vencido pero sin barrer
    await makeRedemption(tenantA, {
      status: 'pending',
      expiresAt: new Date(Date.now() - 1000),
    })
    // Otros status no cuentan
    await makeRedemption(tenantA, { status: 'claimed' })
    await makeRedemption(tenantA, {
      status: 'pending',
      expiresAt: new Date(Date.now() - 1000),
    })
    await makeRedemption(tenantA, { status: 'cancelled' })

    const count = await countPendingRedemptions(tenantA._id)
    expect(count).toBe(1)
  })

  it('no cuenta canjes de otro tenant', async () => {
    await makeRedemption(tenantA)
    await makeRedemption(tenantB, { memberId: member._id, storeItemId: item._id })

    expect(await countPendingRedemptions(tenantA._id)).toBe(1)
    expect(await countPendingRedemptions(tenantB._id)).toBe(1)
  })

  it('NO cuenta canjes de checkout (el badge es solo standalone)', async () => {
    await makeRedemption(tenantA, { status: 'pending', source: 'checkout', expiresAt: null })
    await makeRedemption(tenantA, { status: 'pending', source: 'standalone' })
    await makeRedemption(tenantA, {
      status: 'pending',
      source: 'standalone',
      expiresAt: new Date(Date.now() - 1000),
    })

    expect(await countPendingRedemptions(tenantA._id)).toBe(1)
  })
})
