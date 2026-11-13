// ============================================================================
// inventory-purchasing.test.ts — proveedores y órdenes de compra (F2)
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import User from '@/models/User'
import InventoryLedger from '@/models/InventoryLedger'
import InventorySKU from '@/models/InventorySKU'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import Supplier from '@/models/Supplier'
import { auth } from '@/lib/auth'
import { POST as skusPost } from '@/app/api/[tenant]/inventory/skus/route'
import { GET as suppliersGet, POST as suppliersPost } from '@/app/api/[tenant]/inventory/suppliers/route'
import { POST as suppliersImport } from '@/app/api/[tenant]/inventory/suppliers/import/route'
import { PATCH as supplierPatch } from '@/app/api/[tenant]/inventory/suppliers/[supplierId]/route'
import { GET as ordersGet, POST as ordersPost } from '@/app/api/[tenant]/inventory/purchase-orders/route'
import { PATCH as orderPatch } from '@/app/api/[tenant]/inventory/purchase-orders/[orderId]/route'

const SLUG = 'inv-compras'
let tenant: any, centro: any, norte: any, sur: any
let stCentro: string, stNorte: string, stSur: string
let carne: string, pan: string
const oid = () => new mongoose.Types.ObjectId().toString()
const ADMIN = oid(), MGR_NORTE = oid(), COCINA_CENTRO = oid(), MGR_SUR = oid()

function as(id: string, role: string) {
  vi.mocked(auth).mockResolvedValue({ user: { id, role, tenantId: tenant._id.toString(), assignedLocations: [] }, expires: '' } as any)
}
const P = { params: Promise.resolve({ tenant: SLUG }) }
const req = (method: string, path: string, body?: unknown) =>
  new NextRequest(`http://localhost/api/${SLUG}/inventory/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const patchOrder = (id: string, body: unknown) => orderPatch(req('PATCH', `purchase-orders/${id}`, body), { params: Promise.resolve({ tenant: SLUG, orderId: id }) })

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({ slug: SLUG, name: 'La Esquina', isActive: true, status: 'active', plan: 'full' })
  centro = await Location.create({ tenantId: tenant._id, slug: 'centro', name: 'Centro', address: 'X', isActive: true })
  norte = await Location.create({ tenantId: tenant._id, slug: 'norte', name: 'Norte', address: 'Y', isActive: true })
  sur = await Location.create({ tenantId: tenant._id, slug: 'sur', name: 'Sur', address: 'Z', isActive: true })
  const storage = async (loc: any) => String((await InventoryStorageLocation.create({ tenantId: tenant._id, locationId: loc._id, name: `Cocina ${loc.name}`, type: 'kitchen', isDefaultConsumption: true }))._id)
  stCentro = await storage(centro); stNorte = await storage(norte); stSur = await storage(sur)
  const people: Array<[string, string, any[]]> = [[ADMIN, 'admin', []], [MGR_NORTE, 'manager', [norte._id]], [COCINA_CENTRO, 'kitchen_lead', [centro._id]], [MGR_SUR, 'manager', [sur._id]]]
  for (const [id, role, locs] of people) await User.create({ _id: id, name: `${role}`, email: `${id}@c.test`, password: 'x'.repeat(20), role, tenantId: tenant._id, assignedLocations: locs })
  as(ADMIN, 'admin')
  carne = (await (await skusPost(req('POST', 'skus', { name: 'Carne', category: 'other', canonicalUnit: 'kg', lastUnitCostCents: 1_500_000 }), P)).json()).sku._id
  pan = (await (await skusPost(req('POST', 'skus', { name: 'Pan', category: 'other', canonicalUnit: 'unit' }), P)).json()).sku._id
  await InventorySKU.updateOne({ _id: carne }, { $set: { supplierName: 'Distribuidora Pérez' } })
})

async function newSupplier(body: Record<string, unknown>) {
  return (await (await suppliersPost(req('POST', 'suppliers', body), P)).json()).supplier
}

describe('proveedores', () => {
  it('traer de los insumos, alta, nombre repetido y permisos', async () => {
    const imp = await (await suppliersImport(req('POST', 'suppliers/import'), P)).json()
    expect(imp).toEqual({ created: 1, updated: 0 })
    expect((await (await suppliersImport(req('POST', 'suppliers/import'), P)).json())).toEqual({ created: 0, updated: 0 })

    const res = await suppliersPost(req('POST', 'suppliers', { name: 'Panadería Sol', phone: '+54 9 11 5555-0000', skuIds: [pan] }), P)
    expect(res.status).toBe(201)
    expect((await suppliersPost(req('POST', 'suppliers', { name: 'distribuidora perez' }), P)).status).toBe(409)

    const list = await (await suppliersGet(req('GET', 'suppliers'), P)).json()
    expect(list.suppliers.map((s: any) => [s.name, s.products.length])).toEqual([['Distribuidora Pérez', 1], ['Panadería Sol', 1]])

    as(COCINA_CENTRO, 'kitchen_lead')
    expect((await suppliersPost(req('POST', 'suppliers', { name: 'Otro' }), P)).status).toBe(403)
    const sol = list.suppliers[1]
    expect((await supplierPatch(req('PATCH', `suppliers/${sol._id}`, { isActive: false }), { params: Promise.resolve({ tenant: SLUG, supplierId: sol._id }) })).status).toBe(403)
  })
})

describe('órdenes de compra', () => {
  async function draft() {
    const sup = await newSupplier({ name: 'Frigorífico Sur', phone: '+54 9 11 4444-1111', contactName: 'Marta' })
    const res = await ordersPost(req('POST', 'purchase-orders', {
      supplierId: sup._id,
      lines: [
        { skuId: carne, unitCostCents: 1_500_000, allocations: [{ locationId: String(centro._id), quantity: 6 }, { locationId: String(norte._id), quantity: 4 }] },
        { skuId: pan, allocations: [{ locationId: String(centro._id), quantity: 50 }] },
      ],
      note: 'Antes de las 10',
    }), P)
    expect(res.status).toBe(201)
    return { sup, order: (await res.json()).order }
  }

  it('borrador → enviada → recibida en dos entregas por sede; precio y proveedor actualizados', async () => {
    const { sup, order } = await draft()
    expect(order).toMatchObject({ number: 1, status: 'draft', totalCents: 15_000_000, unpricedLines: 1 })
    expect(order.lines[0].allocations.map((a: any) => [a.locationName, a.storageLocationId])).toEqual([['Centro', stCentro], ['Norte', stNorte]])

    const sent = (await (await patchOrder(order._id, { action: 'send' })).json()).order
    expect(sent.status).toBe('sent')
    expect(sent.message).toContain('pedido N.º 1 de La Esquina')
    expect(sent.message).toContain('– Norte: 4 kg')
    expect(sent.whatsapp).toMatch(/^https:\/\/wa\.me\/5491144441111\?text=/)
    // Enviada ya no se edita.
    expect((await patchOrder(order._id, { action: 'update', lines: [{ skuId: pan, allocations: [{ locationId: String(centro._id), quantity: 1 }] }] })).status).toBe(409)

    // Jefe de cocina de Centro recibe lo de Centro, con otro precio.
    as(COCINA_CENTRO, 'kitchen_lead')
    const r1Body = { action: 'receive', receiptId: 'entrega-0001', invoiceRef: 'A-0001-123', items: [{ skuId: carne, storageLocationId: stCentro, quantity: 6, unitCostCents: 1_600_000 }, { skuId: pan, storageLocationId: stCentro, quantity: 50, unitCostCents: 20_000 }] }
    const r1 = (await (await patchOrder(order._id, r1Body)).json()).order
    expect(r1.status).toBe('partial')
    expect(r1.actions).toEqual(['receive']) // no puede cerrar ni cancelar
    const events = await InventoryLedger.find({ correlationId: `po:${order._id}`, eventType: 'GoodsReceived' }).lean()
    expect(events.map((e: any) => [String(e.skuId), String(e.storageLocationId), e.payload.quantity, e.payload.unitCostCents, e.payload.supplierName]).sort()).toEqual(
      [[carne, stCentro, 6, 1_600_000, 'Frigorífico Sur'], [pan, stCentro, 50, 20_000, 'Frigorífico Sur']].sort(),
    )
    // Reintentar la misma entrega no duplica.
    await patchOrder(order._id, r1Body)
    expect(await InventoryLedger.countDocuments({ correlationId: `po:${order._id}` })).toBe(2)
    // Lo de Norte no lo puede recibir alguien de Centro.
    expect((await patchOrder(order._id, { action: 'receive', receiptId: 'entrega-0002', items: [{ skuId: carne, storageLocationId: stNorte, quantity: 4 }] })).status).toBe(404)

    const sku = await InventorySKU.findById(carne).lean<any>()
    expect(sku).toMatchObject({ lastUnitCostCents: 1_600_000, supplierName: 'Frigorífico Sur' })
    const supplier = await Supplier.findById(sup._id).lean<any>()
    expect(supplier.products.find((p: any) => String(p.skuId) === carne).lastUnitCostCents).toBe(1_600_000)

    // Norte recibe 3,5 de 4: queda parcial; el encargado de Norte no puede cerrar (la orden es de dos sedes).
    as(MGR_NORTE, 'manager')
    const r2 = (await (await patchOrder(order._id, { action: 'receive', receiptId: 'entrega-0003', items: [{ skuId: carne, storageLocationId: stNorte, quantity: 3.5 }] })).json()).order
    expect(r2.status).toBe('partial')
    expect(r2.lines[0]).toMatchObject({ ordered: 10, received: 9.5 })
    expect((await patchOrder(order._id, { action: 'close' })).status).toBe(404)

    as(ADMIN, 'admin')
    const closed = (await (await patchOrder(order._id, { action: 'close' })).json()).order
    expect(closed).toMatchObject({ status: 'received', closedShort: true })
    expect((await patchOrder(order._id, { action: 'cancel' })).status).toBe(409)
  })

  it('todo lo pedido llega en una entrega → recibida', async () => {
    const { order } = await draft()
    await patchOrder(order._id, { action: 'send' })
    const done = (await (await patchOrder(order._id, {
      action: 'receive', receiptId: 'entrega-full',
      items: [{ skuId: carne, storageLocationId: stCentro, quantity: 6 }, { skuId: carne, storageLocationId: stNorte, quantity: 4 }, { skuId: pan, storageLocationId: stCentro, quantity: 50 }],
    })).json()).order
    expect(done.status).toBe('received')
    expect(done.closedShort).toBe(false)
  })

  it('borrador: editar y cancelar; numeración seguida', async () => {
    const { sup, order } = await draft()
    const edited = (await (await patchOrder(order._id, { action: 'update', lines: [{ skuId: pan, unitCostCents: 25_000, allocations: [{ locationId: String(norte._id), quantity: 20 }] }], expectedAt: '2026-11-20' })).json()).order
    expect(edited.lines.map((l: any) => l.name)).toEqual(['Pan'])
    expect(edited.expectedAt).toBe('2026-11-20')
    expect((await (await patchOrder(order._id, { action: 'cancel' })).json()).order.status).toBe('cancelled')
    const second = (await (await ordersPost(req('POST', 'purchase-orders', { supplierId: sup._id, lines: [{ skuId: pan, allocations: [{ locationId: String(centro._id), quantity: 5 }] }] }), P)).json()).order
    expect(second.number).toBe(2)
  })

  it('alcance y validaciones', async () => {
    const { sup, order } = await draft()
    // Encargado de Sur no ve la orden ni la toca.
    as(MGR_SUR, 'manager')
    expect((await (await ordersGet(req('GET', 'purchase-orders'), P)).json()).orders).toHaveLength(0)
    expect((await patchOrder(order._id, { action: 'send' })).status).toBe(404)
    // Encargado de Norte no puede armar una orden para Centro.
    as(MGR_NORTE, 'manager')
    expect((await ordersPost(req('POST', 'purchase-orders', { supplierId: sup._id, lines: [{ skuId: pan, allocations: [{ locationId: String(centro._id), quantity: 1 }] }] }), P)).status).toBe(404)
    // Ve la orden (tiene una parte para Norte) pero no la puede enviar (incluye Centro).
    const seen = (await (await ordersGet(req('GET', 'purchase-orders?estado=abiertas'), P)).json()).orders
    expect(seen.map((o: any) => [o.number, o.actions])).toEqual([[1, []]])

    as(ADMIN, 'admin')
    const bad = (lines: unknown) => ordersPost(req('POST', 'purchase-orders', { supplierId: sup._id, lines }), P)
    expect((await bad([{ skuId: pan, allocations: [{ locationId: String(centro._id), storageLocationId: stNorte, quantity: 1 }] }])).status).toBe(400)
    expect((await bad([{ skuId: pan, allocations: [{ locationId: String(centro._id), quantity: 1 }] }, { skuId: pan, allocations: [{ locationId: String(norte._id), quantity: 1 }] }])).status).toBe(400)
    expect((await bad([{ skuId: pan, allocations: [{ locationId: String(centro._id), quantity: 0 }] }])).status).toBe(400)
    expect((await ordersPost(req('POST', 'purchase-orders', { supplierId: oid(), lines: [{ skuId: pan, allocations: [{ locationId: String(centro._id), quantity: 1 }] }] }), P)).status).toBe(400)
    // Jefe de cocina no arma órdenes; cajero no ve compras.
    as(COCINA_CENTRO, 'kitchen_lead')
    expect((await bad([{ skuId: pan, allocations: [{ locationId: String(centro._id), quantity: 1 }] }])).status).toBe(403)
    as('cajero-1', 'cashier')
    expect((await ordersGet(req('GET', 'purchase-orders'), P)).status).toBe(403)
  })
})
