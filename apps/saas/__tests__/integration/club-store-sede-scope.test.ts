// ============================================================================
// club-store-sede-scope.test.ts — Club por sede y tienda de canjes
// ============================================================================
// - Ítems globales de la plataforma: de solo lectura para los negocios.
// - Club por sede: socios y canjes de otra sede no se ven ni se operan.
// - Historial de un socio: siempre del tenant del URL.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import StoreItem from '@/models/StoreItem'
import LoyaltyMember from '@/models/LoyaltyMember'
import { PUT as putItem, DELETE as deleteItem } from '@/app/api/[tenant]/store/items/[itemId]/route'
import { PATCH as toggleItem } from '@/app/api/[tenant]/store/items/[itemId]/toggle/route'
import { GET as listMembers } from '@/app/api/[tenant]/loyalty/members/route'
import { GET as getMember } from '@/app/api/[tenant]/loyalty/members/[memberId]/route'
import { GET as memberTransactions } from '@/app/api/[tenant]/loyalty/members/[memberId]/transactions/route'
import { auth } from '@/lib/auth'

const SLUG = 'chopis-test'
let tenant: any
let loc1: any
let loc2: any

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({
    slug: SLUG, name: 'Chopis', isActive: true, status: 'active', plan: 'full',
    loyalty: { perLocation: true },
  })
  loc1 = await Location.create({ tenantId: tenant._id, slug: 'a', name: 'Sede A', address: 'A', isActive: true })
  loc2 = await Location.create({ tenantId: tenant._id, slug: 'b', name: 'Sede B', address: 'B', isActive: true })
})

function setSessionUser(user: Record<string, unknown>) {
  vi.mocked(auth).mockResolvedValue({ user, expires: '' } as any)
}
const tenantAdmin = () => ({ id: 'a1', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [] })
const managerOf = (loc: any) => ({ id: 'm1', role: 'manager', tenantId: tenant._id.toString(), assignedLocations: [loc._id.toString()] })

const req = (path: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost/api/${SLUG}/${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

const itemFields = { name: 'Café', description: 'Gratis', imageUrl: 'https://x/y.png', pointsCost: 100, category: 'drink' }

async function member(loc: any, t = tenant, name = 'Socio') {
  return LoyaltyMember.collection.insertOne({
    tenantId: t._id, locationId: loc?._id ?? null, name, status: 'active',
    loyalty: { points: 0 }, wallet: { publicId: new mongoose.Types.ObjectId().toString() },
    createdAt: new Date(), updatedAt: new Date(),
  })
}

describe('tienda — ítems globales de la plataforma', () => {
  it('un negocio no edita, borra ni desactiva un ítem global', async () => {
    const global = await StoreItem.collection.insertOne({
      ...itemFields, scope: 'global', targetTenants: [], isActive: true, createdAt: new Date(),
    })
    const id = global.insertedId.toString()
    setSessionUser(tenantAdmin())
    const pp = { params: Promise.resolve({ tenant: SLUG, itemId: id }) }

    expect((await putItem(req(`store/items/${id}`, 'PUT', { name: 'Hackeado' }), pp)).status).toBe(404)
    expect((await toggleItem(req(`store/items/${id}/toggle`, 'PATCH'), pp)).status).toBe(404)
    expect((await deleteItem(req(`store/items/${id}`, 'DELETE'), pp)).status).toBe(404)

    const after = await StoreItem.collection.findOne({ _id: global.insertedId })
    expect(after?.name).toBe('Café')
    expect(after?.isActive).toBe(true)
  })

  it('PUT de ítem propio no permite volverlo global ni moverlo de tenant', async () => {
    const own = await StoreItem.create({ ...itemFields, tenantId: tenant._id, locationId: null })
    setSessionUser(tenantAdmin())
    const pp = { params: Promise.resolve({ tenant: SLUG, itemId: own._id.toString() }) }
    const res = await putItem(req(`store/items/${own._id}`, 'PUT', {
      scope: 'global', tenantId: '507f1f77bcf86cd799439011', name: 'Cortado',
    }), pp)
    expect(res.status).toBe(200)
    const after = await StoreItem.findById(own._id).lean() as any
    expect(after.name).toBe('Cortado')
    expect(after.scope).not.toBe('global')
    expect(after.tenantId.toString()).toBe(tenant._id.toString())
  })

  it('manager de L1 no edita un ítem de L2', async () => {
    const it2 = await StoreItem.create({ ...itemFields, tenantId: tenant._id, locationId: loc2._id })
    setSessionUser(managerOf(loc1))
    const pp = { params: Promise.resolve({ tenant: SLUG, itemId: it2._id.toString() }) }
    expect((await putItem(req(`store/items/${it2._id}`, 'PUT', { name: 'X' }), pp)).status).toBe(404)
  })
})

describe('club por sede', () => {
  it('listado de manager de L1 sin locationId → solo socios de L1', async () => {
    await member(loc1, tenant, 'De A')
    await member(loc2, tenant, 'De B')
    setSessionUser(managerOf(loc1))
    const res = await listMembers(req('loyalty/members'), { params: Promise.resolve({ tenant: SLUG }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    const names = (body.members ?? []).map((m: any) => m.name)
    expect(names).toContain('De A')
    expect(names).not.toContain('De B')
  })

  it('manager de L1 pide ?locationId=L2 → 404', async () => {
    setSessionUser(managerOf(loc1))
    const res = await listMembers(req(`loyalty/members?locationId=${loc2._id}`), { params: Promise.resolve({ tenant: SLUG }) })
    expect(res.status).toBe(404)
  })

  it('detalle de un socio de L2 para manager de L1 → 404', async () => {
    const { insertedId } = await member(loc2)
    setSessionUser(managerOf(loc1))
    const res = await getMember(req(`loyalty/members/${insertedId}`), {
      params: Promise.resolve({ tenant: SLUG, memberId: insertedId.toString() }),
    })
    expect(res.status).toBe(404)
  })

  it('historial de un socio de OTRO tenant → 404', async () => {
    const other = await Tenant.create({ slug: 'otro', name: 'Otro', isActive: true, plan: 'full' })
    const { insertedId } = await member(null, other)
    setSessionUser(tenantAdmin())
    const res = await memberTransactions(req(`loyalty/members/${insertedId}/transactions`), {
      params: Promise.resolve({ tenant: SLUG, memberId: insertedId.toString() }),
    })
    expect(res.status).toBe(404)
  })

  it('club compartido (perLocation off): manager de sede ve a todos (no regresión)', async () => {
    await Tenant.updateOne({ _id: tenant._id }, { $set: { 'loyalty.perLocation': false } })
    await member(null, tenant, 'Compartido')
    setSessionUser(managerOf(loc1))
    const body = await (await listMembers(req('loyalty/members'), { params: Promise.resolve({ tenant: SLUG }) })).json()
    expect((body.members ?? []).map((m: any) => m.name)).toContain('Compartido')
  })
})

