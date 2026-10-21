// ============================================================================
// admin-sede-scope.test.ts — Scope de sede en rutas admin con recurso de sede
// ============================================================================
// Promociones (compartidas con override), impresoras, inventario y ajuste de
// efectivo: un usuario con sedes asignadas no opera recursos de otra sede.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))
// reorder valida el header CSRF x-tenant-slug con next/headers.
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ 'x-tenant-slug': 'chopis-test' })),
}))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Promotion from '@/models/Promotion'
import Printer from '@/models/Printer'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import { POST as createPromo } from '@/app/api/[tenant]/promotions/route'
import { PUT as updatePromo, DELETE as deletePromo } from '@/app/api/[tenant]/promotions/[promotionId]/route'
import { PUT as reorderPromos } from '@/app/api/[tenant]/promotions/reorder/route'
import { GET as listPrinters } from '@/app/api/[tenant]/printers/route'
import { PATCH as patchPrinter } from '@/app/api/[tenant]/printers/[printerId]/route'
import { POST as receipts } from '@/app/api/[tenant]/inventory/receipts/route'
import InventorySKU from '@/models/InventorySKU'
import { auth } from '@/lib/auth'

const SLUG = 'chopis-test'
let tenant: any
let loc1: any
let loc2: any

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({ slug: SLUG, name: 'Chopis', isActive: true, status: 'active', plan: 'full' })
  loc1 = await Location.create({ tenantId: tenant._id, slug: 'a', name: 'Sede A', address: 'A', isActive: true })
  loc2 = await Location.create({ tenantId: tenant._id, slug: 'b', name: 'Sede B', address: 'B', isActive: true })
})

function setSessionUser(user: Record<string, unknown>) {
  vi.mocked(auth).mockResolvedValue({ user, expires: '' } as any)
}
const managerOf = (loc: any) => ({ id: 'm1', role: 'manager', tenantId: tenant._id.toString(), assignedLocations: [loc._id.toString()] })
const tenantAdmin = () => ({ id: 'a1', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [] })

const params = { params: Promise.resolve({ tenant: SLUG }) }
const json = (path: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost/api/${SLUG}/${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

async function promo(locationId: unknown, title = 'Promo') {
  return Promotion.create({ tenantId: tenant._id, locationId, title, type: 'info', isActive: true })
}

describe('promociones — compartidas con override por sede', () => {
  it('manager de L1 crea promo en L2 → 404', async () => {
    setSessionUser(managerOf(loc1))
    const res = await createPromo(json('promotions', 'POST', { title: 'X', type: 'info', locationId: loc2._id.toString() }), params)
    expect(res.status).toBe(404)
  })

  it('manager de L1 no crea promos compartidas (todas las sedes) → 404', async () => {
    setSessionUser(managerOf(loc1))
    const res = await createPromo(json('promotions', 'POST', { title: 'X', type: 'info', locationId: null }), params)
    expect(res.status).toBe(404)
  })

  it('manager de L1 crea promo en su sede → 201', async () => {
    setSessionUser(managerOf(loc1))
    const res = await createPromo(json('promotions', 'POST', { title: 'X', type: 'info', locationId: loc1._id.toString() }), params)
    expect(res.status).toBe(201)
  })

  it('admin de tenant crea promo compartida → 201', async () => {
    setSessionUser(tenantAdmin())
    const res = await createPromo(json('promotions', 'POST', { title: 'X', type: 'info', locationId: null }), params)
    expect(res.status).toBe(201)
  })

  it('manager de L1 edita/borra promo de L2 → 404 y no cambia', async () => {
    const p = await promo(loc2._id, 'De B')
    setSessionUser(managerOf(loc1))
    const pp = { params: Promise.resolve({ tenant: SLUG, promotionId: p._id.toString() }) }
    expect((await updatePromo(json(`promotions/${p._id}`, 'PUT', { title: 'Hackeada' }), pp)).status).toBe(404)
    expect((await deletePromo(json(`promotions/${p._id}`, 'DELETE'), pp)).status).toBe(404)
    expect((await Promotion.findById(p._id).lean() as any).title).toBe('De B')
  })

  it('manager de L1 no mueve su promo a L2', async () => {
    const p = await promo(loc1._id)
    setSessionUser(managerOf(loc1))
    const pp = { params: Promise.resolve({ tenant: SLUG, promotionId: p._id.toString() }) }
    const res = await updatePromo(json(`promotions/${p._id}`, 'PUT', { locationId: loc2._id.toString() }), pp)
    expect(res.status).toBe(404)
  })

  it('PUT no permite reasignar tenantId (asignación masiva)', async () => {
    const p = await promo(loc1._id)
    setSessionUser(tenantAdmin())
    const pp = { params: Promise.resolve({ tenant: SLUG, promotionId: p._id.toString() }) }
    const res = await updatePromo(json(`promotions/${p._id}`, 'PUT', {
      tenantId: '507f1f77bcf86cd799439011', scope: 'global', targetTenants: ['507f1f77bcf86cd799439011'], title: 'Ok',
    }), pp)
    expect(res.status).toBe(200)
    const after = await Promotion.findById(p._id).lean() as any
    expect(after.tenantId.toString()).toBe(tenant._id.toString())
    expect(after.scope).toBe('tenant')
    expect(after.targetTenants).toHaveLength(0)
    expect(after.title).toBe('Ok')
  })

  it('reorder de manager de L1 solo toca promos de L1', async () => {
    const a = await promo(loc1._id, 'A')
    const b = await promo(loc2._id, 'B')
    await Promotion.updateOne({ _id: b._id }, { $set: { sortOrder: 99 } })
    setSessionUser({ ...managerOf(loc1), role: 'admin' })
    const res = await reorderPromos(json('promotions/reorder', 'PUT', { orderedIds: [b._id.toString(), a._id.toString()] }), params)
    expect(res.status).toBe(200)
    expect((await Promotion.findById(b._id).lean() as any).sortOrder).toBe(99)
    expect((await Promotion.findById(a._id).lean() as any).sortOrder).toBe(1)
  })
})

describe('impresoras', () => {
  it('listado de manager de L1 sin locationId → solo L1', async () => {
    await Printer.create({ tenantId: tenant._id, locationId: loc1._id, uid: 'P1', name: 'Cocina', ip: '10.0.0.1' })
    await Printer.create({ tenantId: tenant._id, locationId: loc2._id, uid: 'P2', name: 'Cocina', ip: '10.0.0.2' })
    setSessionUser(managerOf(loc1))
    const body = await (await listPrinters(json('printers', 'GET'), params)).json()
    expect(body.printers).toHaveLength(1)
    expect(body.printers[0].uid).toBe('P1')
  })

  it('listado de manager de L1 con ?locationId=L2 → 404', async () => {
    setSessionUser(managerOf(loc1))
    const res = await listPrinters(json(`printers?locationId=${loc2._id}`, 'GET'), params)
    expect(res.status).toBe(404)
  })

  it('manager de L1 edita impresora de L2 → 404 y no cambia', async () => {
    const pr = await Printer.create({ tenantId: tenant._id, locationId: loc2._id, uid: 'P2', name: 'Barra', ip: '10.0.0.2' })
    setSessionUser(managerOf(loc1))
    const res = await patchPrinter(
      json(`printers/${pr._id}`, 'PATCH', { name: 'Hackeada' }),
      { params: Promise.resolve({ tenant: SLUG, printerId: pr._id.toString() }) }
    )
    expect(res.status).toBe(404)
    expect((await Printer.findById(pr._id).lean() as any).name).toBe('Barra')
  })
})

describe('inventario — ubicación de stock', () => {
  // Insumo REAL del tenant: así el 404 solo puede venir del depósito.
  const body = async (storageLocationId: string) => {
    const sku = await InventorySKU.create({ tenantId: tenant._id, name: 'Carne', nameKey: 'carne', category: 'meat_poultry', canonicalUnit: 'kg' })
    return { skuId: sku._id.toString(), storageLocationId, quantity: 1, unit: 'kg', totalCostCents: 100 }
  }

  it('ubicación de otro tenant → 404', async () => {
    const other = await Tenant.create({ slug: 'otro', name: 'Otro', isActive: true })
    const foreign = await InventoryStorageLocation.create({ tenantId: other._id, locationId: loc1._id, name: 'Ajena', type: 'kitchen' })
    setSessionUser(tenantAdmin())
    const res = await receipts(json('inventory/receipts', 'POST', await body(foreign._id.toString())), params)
    expect(res.status).toBe(404)
  })

  it('ubicación de L2 para manager de L1 → 404', async () => {
    const st = await InventoryStorageLocation.create({ tenantId: tenant._id, locationId: loc2._id, name: 'Cámara B', type: 'cold_storage' })
    setSessionUser(managerOf(loc1))
    const res = await receipts(json('inventory/receipts', 'POST', await body(st._id.toString())), params)
    expect(res.status).toBe(404)
  })
})
