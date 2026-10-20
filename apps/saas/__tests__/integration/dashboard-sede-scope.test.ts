// ============================================================================
// dashboard-sede-scope.test.ts — Dashboard admin por sede (H3)
// ============================================================================
// El dashboard ya no devuelve números consolidados a un usuario de sede:
//   - usuario con sedes asignadas → solo sus sedes
//   - ?locationId= del selector   → solo esa sede (ajena → 403)
//   - usuario de tenant           → consolidado
//   - ICO / comisiones            → solo consolidado
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'
import { GET as getStats } from '@/app/api/[tenant]/admin/dashboard/stats/route'
import { GET as getComisiones } from '@/app/api/[tenant]/admin/dashboard/comisiones/route'
import { GET as getSummary } from '@/app/api/[tenant]/admin/dashboard/summary/route'
import { auth } from '@/lib/auth'

let tenant: any
let loc1: any
let loc2: any

beforeEach(async () => {
  tenant = await Tenant.create({
    slug: 'chopis-test', name: 'Chopis (test)', isActive: true, status: 'active', plan: 'full',
  })
  loc1 = await Location.create({ tenantId: tenant._id, slug: 'sede-a', name: 'Sede A', address: 'A 1', isActive: true })
  loc2 = await Location.create({ tenantId: tenant._id, slug: 'sede-b', name: 'Sede B', address: 'B 2', isActive: true })
  const base = { tenantId: tenant._id, deletedAt: null, total: 1000, createdAt: new Date(), updatedAt: new Date() }
  await Order.collection.insertMany([
    { ...base, locationId: loc1._id, orderNumber: 'A-1', status: 'pending' },
    { ...base, locationId: loc1._id, orderNumber: 'A-2', status: 'confirmed' },
    { ...base, locationId: loc2._id, orderNumber: 'B-1', status: 'confirmed' },
  ])
})

function setSessionUser(user: Record<string, unknown>) {
  vi.mocked(auth).mockResolvedValue({ user, expires: '' } as any)
}

const params = { params: Promise.resolve({ tenant: 'chopis-test' }) }
const req = (path: string, qs = '') => new NextRequest(`http://localhost/api/chopis-test/admin/dashboard/${path}${qs}`)

describe('dashboard — alcance de sede', () => {
  it('admin de tenant (sin sedes) → consolidado', async () => {
    setSessionUser({ id: 'u1', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [] })
    const res = await getStats(req('stats'), params)
    expect(res.status).toBe(200)
    expect((await res.json()).total).toBe(3)
  })

  it('usuario scoped a L1 → solo pedidos de L1', async () => {
    setSessionUser({ id: 'u2', role: 'manager', tenantId: tenant._id.toString(), assignedLocations: [loc1._id.toString()] })
    const body = await (await getStats(req('stats'), params)).json()
    expect(body.total).toBe(2)
    expect(body.confirmed).toBe(1)
  })

  it('selector ?locationId=L2 para admin de tenant → solo L2', async () => {
    setSessionUser({ id: 'u1', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [] })
    const body = await (await getStats(req('stats', `?locationId=${loc2._id}`), params)).json()
    expect(body.total).toBe(1)
  })

  it('usuario scoped a L1 pide ?locationId=L2 → 403', async () => {
    setSessionUser({ id: 'u2', role: 'manager', tenantId: tenant._id.toString(), assignedLocations: [loc1._id.toString()] })
    const res = await getStats(req('stats', `?locationId=${loc2._id}`), params)
    expect(res.status).toBe(403)
  })

  it('locationId de otro tenant → 404', async () => {
    const other = await Tenant.create({ slug: 'otro', name: 'Otro', isActive: true, status: 'active', plan: 'full' })
    const foreign = await Location.create({ tenantId: other._id, slug: 'x', name: 'X', address: 'X', isActive: true })
    setSessionUser({ id: 'u1', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [] })
    const res = await getStats(req('stats', `?locationId=${foreign._id}`), params)
    expect(res.status).toBe(404)
  })

  it('locationId malformado → 400', async () => {
    setSessionUser({ id: 'u1', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [] })
    const res = await getStats(req('stats', '?locationId=abc'), params)
    expect(res.status).toBe(400)
  })

  it('usuario de otro tenant → 403', async () => {
    setSessionUser({ id: 'u9', role: 'admin', tenantId: '507f1f77bcf86cd799439011', assignedLocations: [] })
    const res = await getStats(req('stats'), params)
    expect(res.status).toBe(403)
  })

  it('comisiones (métrica de negocio completo) para usuario de sede → 403', async () => {
    setSessionUser({ id: 'u2', role: 'manager', tenantId: tenant._id.toString(), assignedLocations: [loc1._id.toString()] })
    const res = await getComisiones(req('comisiones'), params)
    expect(res.status).toBe(403)
  })

  it('summary scoped: stats de su sede, sin ICO ni comisiones', async () => {
    setSessionUser({ id: 'u2', role: 'manager', tenantId: tenant._id.toString(), assignedLocations: [loc1._id.toString()] })
    const res = await getSummary(req('summary'), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stats.total).toBe(2)
    expect(body.scope).toEqual({ consolidated: false, locationIds: [loc1._id.toString()] })
    expect(body.ico).toBeNull()
    expect(body.comisiones).toBeNull()
  })

  it('summary consolidado: incluye ICO y comisiones', async () => {
    setSessionUser({ id: 'u1', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [] })
    const body = await (await getSummary(req('summary'), params)).json()
    expect(body.stats.total).toBe(3)
    expect(body.scope.consolidated).toBe(true)
    expect(body.ico).not.toBeNull()
    expect(body.comisiones).not.toBeNull()
  })
})
