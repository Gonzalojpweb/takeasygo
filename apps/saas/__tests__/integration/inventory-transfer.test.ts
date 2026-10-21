// ============================================================================
// inventory-transfer.test.ts — Transferencia de stock entre sedes
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import InventorySKU from '@/models/InventorySKU'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import InventoryLedger from '@/models/InventoryLedger'
import InventoryState from '@/models/InventoryState'
import { POST as transfer, GET as listTransfers } from '@/app/api/[tenant]/inventory/transfers/route'
import { auth } from '@/lib/auth'
import { appendEvents } from '@/lib/inventory/projector'

const SLUG = 'stock-test'
let tenant: any
let locA: any
let locB: any
let depA: any
let depB: any
let sku: any

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({ slug: SLUG, name: 'Stock', isActive: true, status: 'active', plan: 'full' })
  locA = await Location.create({ tenantId: tenant._id, slug: 'a', name: 'A', address: 'A', isActive: true })
  locB = await Location.create({ tenantId: tenant._id, slug: 'b', name: 'B', address: 'B', isActive: true })
  depA = await InventoryStorageLocation.create({ tenantId: tenant._id, locationId: locA._id, name: 'Cámara A', type: 'cold_storage' })
  depB = await InventoryStorageLocation.create({ tenantId: tenant._id, locationId: locB._id, name: 'Cámara B', type: 'cold_storage' })
  sku = await InventorySKU.create({
    tenantId: tenant._id, name: 'Carne', category: 'meat_poultry', canonicalUnit: 'kg',
    nameKey: 'carne', lastUnitCostCents: 900_000,
  })
  // Línea base: conteo físico de 10 kg en A (el estado se proyecta del ledger).
  await appendEvents([{
    eventId: 'seed-count', tenantId: tenant._id, locationId: locA._id, skuId: sku._id, storageLocationId: depA._id,
    eventType: 'PhysicalCountObserved', occurredAt: new Date(Date.now() - 60_000), source: 'manual',
    observationMethod: 'manual_scale', payload: { observedQuantity: 10, unit: 'kg' },
  }])
  setSessionUser({ id: 'a1', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [] })
})

function setSessionUser(user: Record<string, unknown>) {
  vi.mocked(auth).mockResolvedValue({ user, expires: '' } as any)
}
const params = { params: Promise.resolve({ tenant: SLUG }) }
const post = (body: Record<string, unknown>) =>
  transfer(new NextRequest(`http://localhost/api/${SLUG}/inventory/transfers`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), params)

const body = (over: Record<string, unknown> = {}) => ({
  skuId: sku._id.toString(),
  fromStorageLocationId: depA._id.toString(),
  toStorageLocationId: depB._id.toString(),
  quantity: 3,
  reason: 'Faltante en B',
  ...over,
})

describe('transferencia de stock', () => {
  it('mueve el stock: baja en origen, sube en destino, dos eventos con el mismo correlationId', async () => {
    const res = await post(body())
    expect(res.status).toBe(201)
    const { transferId } = await res.json()

    const events = await InventoryLedger.find({ correlationId: transferId }).lean() as any[]
    expect(events.map(e => e.eventType).sort()).toEqual(['TransferIn', 'TransferOut'])
    expect(events[0].payload.fromLocationId).toBe(String(locA._id))
    expect(events[0].payload.toLocationId).toBe(String(locB._id))

    const a = await InventoryState.findOne({ storageLocationId: depA._id }).lean() as any
    const b = await InventoryState.findOne({ storageLocationId: depB._id }).lean() as any
    expect(a.mu).toBe(7)
    expect(b.mu).toBe(3)
    // El costo promedio del origen viaja con la mercadería.
    expect(b.avgUnitCostCents).toBe(900_000)
  })

  it('reintentar con el mismo transferId no duplica el movimiento', async () => {
    await post(body({ transferId: 'transfer-fijo-1' }))
    await post(body({ transferId: 'transfer-fijo-1' }))
    expect(await InventoryLedger.countDocuments({ correlationId: 'transfer-fijo-1' })).toBe(2)
    const a = await InventoryState.findOne({ storageLocationId: depA._id }).lean() as any
    expect(a.mu).toBe(7)
  })

  it('usuario de la sede B no puede sacar stock de la sede A → 404', async () => {
    setSessionUser({ id: 'm1', role: 'manager', tenantId: tenant._id.toString(), assignedLocations: [locB._id.toString()] })
    expect((await post(body())).status).toBe(404)
  })

  it('usuario de la sede A envía a B → 201 (destino solo tiene que ser del tenant)', async () => {
    setSessionUser({ id: 'm2', role: 'manager', tenantId: tenant._id.toString(), assignedLocations: [locA._id.toString()] })
    expect((await post(body())).status).toBe(201)
  })

  it('destino de otro tenant → 404; cantidad inválida → 400', async () => {
    const other = await Tenant.create({ slug: 'otro', name: 'Otro', isActive: true })
    const foreign = await InventoryStorageLocation.create({ tenantId: other._id, locationId: locA._id, name: 'X', type: 'other' })
    expect((await post(body({ toStorageLocationId: foreign._id.toString() }))).status).toBe(404)
    expect((await post(body({ quantity: 0 }))).status).toBe(400)
  })

  it('el listado de un usuario de la sede B muestra las transferencias que entran a B', async () => {
    await post(body())
    setSessionUser({ id: 'm1', role: 'manager', tenantId: tenant._id.toString(), assignedLocations: [locB._id.toString()] })
    const res = await listTransfers(new NextRequest(`http://localhost/api/${SLUG}/inventory/transfers`), params)
    expect((await res.json()).transfers).toHaveLength(1)
  })

  it('un cajero no puede transferir (capacidad manage) → 403', async () => {
    setSessionUser({ id: 'c1', role: 'cashier', tenantId: tenant._id.toString(), assignedLocations: [] })
    expect((await post(body())).status).toBe(403)
  })

  it('plan sin inventario → 403 PLAN_REQUIRED (Lock + CTA)', async () => {
    await Tenant.updateOne({ _id: tenant._id }, { $set: { plan: 'try' } })
    const res = await post(body())
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('PLAN_REQUIRED')
  })
})
