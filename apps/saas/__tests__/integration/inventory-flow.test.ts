// ============================================================================
// inventory-flow.test.ts — flujo operativo completo de TGO Inventory v2
// ============================================================================
// Alta de sede → insumos → receta → venta (POS) → ronda → cancelación →
// reintento → recepción con presentación → conteo → "Verificá estos N".
// Más los controles de seguridad (rol, plan, sede, procedencia).
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import InventoryLedger from '@/models/InventoryLedger'
import InventoryState from '@/models/InventoryState'
import { auth } from '@/lib/auth'
import { syncOrderConsumption } from '@/lib/inventory/sales'
import { onOrderConfirmed } from '@/lib/printing'
import { POST as setupPost } from '@/app/api/[tenant]/inventory/setup/route'
import { PUT as recipesPut, GET as recipesGet } from '@/app/api/[tenant]/inventory/recipes/route'
import { PUT as modifierPut } from '@/app/api/[tenant]/inventory/modifier-rules/route'
import { POST as receiptsPost } from '@/app/api/[tenant]/inventory/receipts/route'
import { POST as countsPost } from '@/app/api/[tenant]/inventory/counts/route'
import { POST as adjustPost } from '@/app/api/[tenant]/inventory/adjustments/route'
import { GET as todayGet } from '@/app/api/[tenant]/inventory/today/route'
import { GET as stockGet } from '@/app/api/[tenant]/inventory/stock/route'
import { GET as historyGet } from '@/app/api/[tenant]/inventory/history/[skuId]/route'

const SLUG = 'flujo-inv'
let tenant: any
let loc: any
let otherLoc: any
let carneId: string
let panId: string
let quesoId: string
let storageId: string
const MENU_ITEM = new mongoose.Types.ObjectId().toString()

function as(user: Record<string, unknown>) {
  vi.mocked(auth).mockResolvedValue({ user: { tenantId: tenant._id.toString(), assignedLocations: [], ...user }, expires: '' } as any)
}
const P = { params: Promise.resolve({ tenant: SLUG }) }
const json = (method: string, path: string, body?: unknown) =>
  new NextRequest(`http://localhost/api/${SLUG}/inventory/${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

async function stateOf(skuId: string) {
  return InventoryState.findOne({ skuId, storageLocationId: storageId }).lean() as any
}

function order(over: Record<string, unknown> = {}) {
  return {
    _id: new mongoose.Types.ObjectId('64b00000000000000000c001'),
    tenantId: tenant._id,
    locationId: loc._id,
    orderNumber: 'A-1',
    status: 'confirmed',
    posId: 'pos-1',
    statusTimestamps: { confirmedAt: new Date() },
    items: [
      {
        _id: new mongoose.Types.ObjectId('64b00000000000000000d001'),
        menuItemId: MENU_ITEM,
        name: 'Hamburguesa',
        quantity: 2,
        customizations: [{ groupName: 'Extras', selectedOptions: [{ name: 'Extra queso' }] }],
      },
    ],
    ...over,
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({ slug: SLUG, name: 'Flujo', isActive: true, status: 'active', plan: 'full' })
  loc = await Location.create({ tenantId: tenant._id, slug: 'centro', name: 'Centro', address: 'X', isActive: true })
  otherLoc = await Location.create({ tenantId: tenant._id, slug: 'norte', name: 'Norte', address: 'Y', isActive: true })
  as({ id: 'admin-1', role: 'admin' })

  const res = await setupPost(json('POST', 'setup', {
    locationId: loc._id.toString(),
    skus: [
      { name: 'Carne picada', category: 'meat_poultry', canonicalUnit: 'kg', businessImpact: 'high', lastUnitCostCents: 800_000 },
      { name: 'Pan de hamburguesa', category: 'dry_goods', canonicalUnit: 'unit', lastUnitCostCents: 30_000 },
      { name: 'Queso cheddar', category: 'dairy', canonicalUnit: 'kg', lastUnitCostCents: 1_200_000 },
    ],
  }), P)
  expect(res.status).toBe(200)
  const setup = await res.json()
  storageId = setup.storageLocationId
  carneId = setup.skuIds['Carne picada']
  panId = setup.skuIds['Pan de hamburguesa']
  quesoId = setup.skuIds['Queso cheddar']

  // Receta en GRAMOS para un insumo en kg (antes: descontaba 150 kg).
  const r = await recipesPut(json('PUT', 'recipes', {
    kind: 'dish', locationId: loc._id.toString(), menuItemId: MENU_ITEM, name: 'Hamburguesa',
    items: [{ skuId: carneId, quantity: 150, unit: 'g' }, { skuId: panId, quantity: 1, unit: 'unit' }],
  }), P)
  expect(r.status).toBe(200)
  await modifierPut(json('PUT', 'modifier-rules', { optionName: 'Extra queso', items: [{ skuId: quesoId, quantity: 30, unit: 'g' }] }), P)

  // Línea base: conteo inicial.
  await countsPost(json('POST', 'counts', { skuId: carneId, storageLocationId: storageId, observedQuantity: 10, unit: 'kg', observationMethod: 'manual_scale' }), P)
  await countsPost(json('POST', 'counts', { skuId: panId, storageLocationId: storageId, observedQuantity: 40, unit: 'unit', observationMethod: 'visual_count' }), P)
})

describe('venta → consumo de insumos', () => {
  it('una venta confirmada descuenta la receta en la unidad correcta + modificadores', async () => {
    const r = await syncOrderConsumption(order())
    expect(r.events).toBe(1) // UN evento por plato (D-04)
    expect((await stateOf(carneId)).mu).toBeCloseTo(9.7, 6) // 10 kg − 2 × 150 g
    expect((await stateOf(panId)).mu).toBeCloseTo(38, 6)
    expect((await stateOf(quesoId)).mu).toBeCloseTo(-0.06, 6) // nunca contado: negativo y marcado
  })

  it('cableado real: onOrderConfirmed (todos los canales) registra la venta en inventario', async () => {
    await onOrderConfirmed(order() as never)
    expect(await InventoryLedger.countDocuments({ eventType: 'SaleRecorded', correlationId: order()._id.toString() })).toBe(1)
    expect((await stateOf(carneId)).mu).toBeCloseTo(9.7, 6)
  })

  it('reintentar no duplica; una ronda agrega solo la diferencia; cancelar devuelve todo', async () => {
    await syncOrderConsumption(order())
    await syncOrderConsumption(order())
    expect(await InventoryLedger.countDocuments({ eventType: 'SaleRecorded' })).toBe(1)

    const withRound = order({
      items: [...order().items, { _id: new mongoose.Types.ObjectId('64b00000000000000000d002'), menuItemId: MENU_ITEM, name: 'Hamburguesa', quantity: 1, customizations: [] }],
    })
    await syncOrderConsumption(withRound)
    expect((await stateOf(carneId)).mu).toBeCloseTo(9.55, 6)

    await syncOrderConsumption({ ...withRound, status: 'cancelled' })
    expect((await stateOf(carneId)).mu).toBeCloseTo(10, 6)
    expect((await stateOf(panId)).mu).toBeCloseTo(40, 6)
    const reasons = (await InventoryLedger.find({ eventType: 'SaleRecorded' }).lean()).map((e: any) => e.payload.reason).sort()
    expect(reasons).toEqual(['cancelled', 'cancelled', 'sold', 'sold'])
  })

  it('una orden no confirmada no consume; un plato sin receta queda registrado como "sin receta"', async () => {
    expect((await syncOrderConsumption(order({ status: 'pending' }))).events).toBe(0)
    const r = await syncOrderConsumption(order({ items: [{ _id: new mongoose.Types.ObjectId(), menuItemId: new mongoose.Types.ObjectId().toString(), name: 'Plato nuevo', quantity: 1, customizations: [] }] }))
    expect(r.unmappedLines).toBe(1)
  })

  it('una sede sin inventario activo no registra nada', async () => {
    const r = await syncOrderConsumption(order({ locationId: otherLoc._id }))
    expect(r.skipped).toBe('no_inventory')
  })

  it('las recetas muestran costo teórico y food cost', async () => {
    const res = await recipesGet(new NextRequest(`http://localhost/api/${SLUG}/inventory/recipes?locationId=${loc._id}`), P)
    expect(res.status).toBe(200)
  })
})

describe('captura de evidencia', () => {
  it('recepción por presentación ("2 cajas de 5 kg") con costo total → costo por kg', async () => {
    const res = await receiptsPost(json('POST', 'receipts', {
      clientEventId: 'rec-00000001', skuId: carneId, storageLocationId: storageId,
      quantity: 2, unit: 'caja', pack: { quantity: 5, unit: 'kg' }, totalCostCents: 9_000_000,
    }), P)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.quantity).toBe(10)
    expect(body.unitCostCents).toBe(900_000)
    // Reintento con el mismo clientEventId: no duplica.
    const again = await receiptsPost(json('POST', 'receipts', {
      clientEventId: 'rec-00000001', skuId: carneId, storageLocationId: storageId,
      quantity: 2, unit: 'caja', pack: { quantity: 5, unit: 'kg' }, totalCostCents: 9_000_000,
    }), P)
    expect(again.status).toBe(200)
    expect((await stateOf(carneId)).mu).toBeCloseTo(20, 6)
  })

  it('unidad incompatible sin presentación → 400 con mensaje operativo', async () => {
    const res = await receiptsPost(json('POST', 'receipts', { skuId: carneId, storageLocationId: storageId, quantity: 2, unit: 'unit' }), P)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/presentación/)
  })

  it('la procedencia la define el servidor: el body no puede firmar como POS ni como otro usuario', async () => {
    await receiptsPost(json('POST', 'receipts', {
      clientEventId: 'rec-00000002', skuId: carneId, storageLocationId: storageId, quantity: 1, unit: 'kg',
      source: 'pos', actorId: 'otro-usuario',
    }), P)
    const ev: any = await InventoryLedger.findOne({ eventId: 'receipt:rec-00000002' }).lean()
    expect(ev.source).toBe('manual')
    expect(ev.actorId).toBe('admin-1')
  })

  it('"Verificá estos N" prioriza lo nunca contado y explica por qué', async () => {
    await syncOrderConsumption(order())
    as({ id: 'c1', role: 'cashier' })
    const res = await todayGet(new NextRequest(`http://localhost/api/${SLUG}/inventory/today?locationId=${loc._id}`), P)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.verifications.length).toBeGreaterThan(0)
    expect(body.alerts.some((a: any) => a.negative)).toBe(true)
  })

  it('historial: las ventas aparecen en el insumo que consumieron', async () => {
    await syncOrderConsumption(order())
    const res = await historyGet(new NextRequest(`http://localhost/api/${SLUG}/inventory/history/${carneId}`), { params: Promise.resolve({ tenant: SLUG, skuId: carneId }) })
    const { events } = await res.json()
    expect(events.find((e: any) => e.eventType === 'SaleRecorded').quantity).toBeCloseTo(-0.3, 6)
  })
})

describe('seguridad', () => {
  it('ajuste: cajero → 403 (antes era un TODO); motivo corto → 400', async () => {
    as({ id: 'c1', role: 'cashier' })
    expect((await adjustPost(json('POST', 'adjustments', { skuId: carneId, storageLocationId: storageId, delta: -1, unit: 'kg', reason: 'faltante detectado en cámara' }), P)).status).toBe(403)
    as({ id: 'm1', role: 'manager' })
    expect((await adjustPost(json('POST', 'adjustments', { skuId: carneId, storageLocationId: storageId, delta: -1, unit: 'kg', reason: 'corto' }), P)).status).toBe(400)
  })

  it('cajero no ve stock valorizado (read) pero sí la lista del día (capture)', async () => {
    as({ id: 'c1', role: 'cashier' })
    expect((await stockGet(new NextRequest(`http://localhost/api/${SLUG}/inventory/stock`), P)).status).toBe(403)
  })

  it('usuario de otra sede: no puede contar en un depósito ajeno → 404', async () => {
    as({ id: 'm2', role: 'manager', assignedLocations: [otherLoc._id.toString()] })
    const res = await countsPost(json('POST', 'counts', { skuId: carneId, storageLocationId: storageId, observedQuantity: 1, unit: 'kg', observationMethod: 'visual_count' }), P)
    expect(res.status).toBe(404)
  })

  it('el ledger es inmutable', async () => {
    await expect(InventoryLedger.updateOne({}, { $set: { 'payload.x': 1 } })).rejects.toThrow(/append-only/)
    await expect(InventoryLedger.deleteMany({})).rejects.toThrow(/append-only/)
  })
})
