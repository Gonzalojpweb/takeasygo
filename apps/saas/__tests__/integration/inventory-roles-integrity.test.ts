// ============================================================================
// inventory-roles-integrity.test.ts — Fase 1 del rediseño de inventario
// ============================================================================
// Roles (aprobado 2026-10-21): inventario solo para admin, manager, gerente de
// operaciones y jefe de cocina. Más las correcciones de la auditoría Fase 0:
//   R1/D-26 variante sin receta ni confirmación → no descuenta (pendiente)
//   R2 montos en pesos solo para quien tiene `read`
//   R3 onOrderConfirmed termina aunque ya se respondió (runAfterResponse)
//   R4 el cron re-proyecta los insumos con estado atrasado
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
import { canRoleUse } from '@/lib/inventory/route'
import { syncOrderConsumption } from '@/lib/inventory/sales'
import { repairStaleAggregates } from '@/lib/inventory/projector'
import { stripTodayValues } from '@/lib/inventory/read'
import { runAfterResponse } from '@/lib/after-response'
import { roleHasPermission } from '@/lib/rbac'
import { POST as setupPost } from '@/app/api/[tenant]/inventory/setup/route'
import { PUT as recipesPut } from '@/app/api/[tenant]/inventory/recipes/route'
import { POST as countsPost } from '@/app/api/[tenant]/inventory/counts/route'
import { POST as adjustPost } from '@/app/api/[tenant]/inventory/adjustments/route'
import { GET as todayGet } from '@/app/api/[tenant]/inventory/today/route'

const SLUG = 'roles-inv'
let tenant: any
let loc: any
let otherLoc: any
let carneId: string
let panId: string
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

function order(variantName: string | null, lineId = '64b00000000000000000e001') {
  return {
    _id: new mongoose.Types.ObjectId(),
    tenantId: tenant._id,
    locationId: loc._id,
    orderNumber: 'B-1',
    status: 'confirmed',
    posId: 'pos-roles',
    statusTimestamps: { confirmedAt: new Date() },
    items: [{
      _id: new mongoose.Types.ObjectId(lineId),
      menuItemId: MENU_ITEM,
      name: 'Hamburguesa',
      quantity: 1,
      selectedVariant: variantName ? { name: variantName } : null,
      customizations: [],
    }],
  }
}

const dobleRecipe = () => ({
  kind: 'dish', locationId: loc._id.toString(), menuItemId: MENU_ITEM, variantName: 'Doble', name: 'Hamburguesa (Doble)',
  items: [{ skuId: carneId, quantity: 300, unit: 'g' }, { skuId: panId, quantity: 1, unit: 'unit' }],
})
const adjustment = () => ({ skuId: carneId, storageLocationId: storageId, delta: -1, unit: 'kg', reason: 'faltante detectado en cámara' })

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({ slug: SLUG, name: 'Roles', isActive: true, status: 'active', plan: 'full' })
  loc = await Location.create({ tenantId: tenant._id, slug: 'centro', name: 'Centro', address: 'X', isActive: true })
  otherLoc = await Location.create({ tenantId: tenant._id, slug: 'norte', name: 'Norte', address: 'Y', isActive: true })
  as({ id: 'admin-1', role: 'admin' })
  const res = await setupPost(json('POST', 'setup', {
    locationId: loc._id.toString(),
    skus: [
      { name: 'Carne picada', category: 'meat_poultry', canonicalUnit: 'kg', businessImpact: 'high', lastUnitCostCents: 800_000 },
      { name: 'Pan de hamburguesa', category: 'dry_goods', canonicalUnit: 'unit', lastUnitCostCents: 30_000 },
    ],
  }), P)
  const setup = await res.json()
  storageId = setup.storageLocationId
  carneId = setup.skuIds['Carne picada']
  panId = setup.skuIds['Pan de hamburguesa']
  await recipesPut(json('PUT', 'recipes', {
    kind: 'dish', locationId: loc._id.toString(), menuItemId: MENU_ITEM, name: 'Hamburguesa',
    items: [{ skuId: carneId, quantity: 150, unit: 'g' }, { skuId: panId, quantity: 1, unit: 'unit' }],
  }), P)
})

describe('roles de inventario', () => {
  it('matriz de capacidades: back-office sí, venta no; el jefe de cocina no gestiona', () => {
    for (const role of ['admin', 'manager', 'operations_manager', 'kitchen_lead']) {
      expect(canRoleUse(role, 'read'), role).toBe(true)
      expect(canRoleUse(role, 'capture'), role).toBe(true)
      expect(canRoleUse(role, 'recipes'), role).toBe(true)
    }
    expect(canRoleUse('operations_manager', 'manage')).toBe(true)
    expect(canRoleUse('kitchen_lead', 'manage')).toBe(false)
    for (const role of ['cashier', 'staff', 'waiter', 'host', 'seller', 'auditor', 'consumer']) {
      for (const cap of ['read', 'capture', 'recipes', 'manage'] as const) {
        expect(canRoleUse(role, cap), `${role}/${cap}`).toBe(false)
      }
    }
  })

  it('RBAC v3: cajero y staff perdieron inventory.capture; los roles nuevos lo tienen', () => {
    expect(roleHasPermission('cashier', 'inventory.capture')).toBe(false)
    expect(roleHasPermission('staff', 'inventory.capture')).toBe(false)
    expect(roleHasPermission('operations_manager', 'inventory.write')).toBe(true)
    expect(roleHasPermission('kitchen_lead', 'inventory.capture')).toBe(true)
  })

  it('jefe de cocina: cuenta y carga recetas, pero no ajusta ni activa sedes', async () => {
    as({ id: 'k1', role: 'kitchen_lead' })
    const count = await countsPost(json('POST', 'counts', { skuId: carneId, storageLocationId: storageId, observedQuantity: 5, unit: 'kg', observationMethod: 'manual_scale' }), P)
    expect(count.status).toBe(201)
    expect((await recipesPut(json('PUT', 'recipes', dobleRecipe()), P)).status).toBe(200)
    expect((await adjustPost(json('POST', 'adjustments', adjustment()), P)).status).toBe(403)
    // Alta de insumos en una sede YA activa: sí (sugerencias de receta).
    const skus = await setupPost(json('POST', 'setup', { locationId: loc._id.toString(), skus: [{ name: 'Lechuga', category: 'vegetables', canonicalUnit: 'kg' }] }), P)
    expect(skus.status).toBe(200)
    // Activar una sede nueva: no.
    expect((await setupPost(json('POST', 'setup', { locationId: otherLoc._id.toString(), skus: [] }), P)).status).toBe(403)
  })

  it('gerente de operaciones: ajusta y activa sedes', async () => {
    as({ id: 'o1', role: 'operations_manager' })
    expect((await adjustPost(json('POST', 'adjustments', adjustment()), P)).status).toBe(201)
    expect((await setupPost(json('POST', 'setup', { locationId: otherLoc._id.toString(), skus: [] }), P)).status).toBe(200)
  })
})

// D-26 (Inventario V3, reemplaza el R1 de la Fase 1): una variante sin receta
// propia NI confirmación de "igual a la base" NO descuenta — antes descontaba
// la base marcada. Nunca se asume que "Triple" consume como la base.
describe('R1 / D-26 — consumo por variante', () => {
  it('variante sin receta ni confirmación: NO descuenta y queda pendiente con motivo', async () => {
    await syncOrderConsumption(order('Triple'))
    const ev: any = await InventoryLedger.findOne({ eventType: 'SaleRecorded', 'payload.variantName': 'Triple' }).lean()
    expect(ev.payload.unmapped).toBe(true)
    expect(ev.payload.unmappedReason).toBe('variant_unconfirmed')
    expect(ev.payload.consumption).toEqual([])
    expect(ev.payload.warnings.join(' ')).toMatch(/Triple.*no tiene receta confirmada/)
  })

  it('variante con receta propia descuenta la suya (no la base)', async () => {
    await recipesPut(json('PUT', 'recipes', dobleRecipe()), P)
    await syncOrderConsumption(order('Doble', '64b00000000000000000e002'))
    const own: any = await InventoryLedger.findOne({ eventType: 'SaleRecorded', 'payload.variantName': 'Doble' }).lean()
    expect(own.payload.unmapped).toBe(false)
    expect(own.payload.variantUsesBase).toBe(false)
    expect(own.payload.consumption.find((c: any) => c.skuId === carneId).quantity).toBeCloseTo(0.3, 6)
  })

  it('variante confirmada "igual a la base" descuenta la base; cancelar devuelve exacto', async () => {
    const res = await recipesPut(json('PUT', 'recipes', {
      kind: 'dish', locationId: loc._id.toString(), menuItemId: MENU_ITEM, variantName: 'Simple', name: 'Hamburguesa (Simple)',
      usesBaseRecipe: true, items: [],
    }), P)
    expect(res.status).toBe(200)
    const sold = order('Simple', '64b00000000000000000e003')
    await syncOrderConsumption(sold)
    const ev: any = await InventoryLedger.findOne({ eventType: 'SaleRecorded', 'payload.variantName': 'Simple' }).lean()
    expect(ev.payload.variantUsesBase).toBe(true)
    expect(ev.payload.consumption.find((c: any) => c.skuId === carneId).quantity).toBeCloseTo(0.15, 6)

    await syncOrderConsumption({ ...sold, status: 'cancelled' })
    const events: any[] = await InventoryLedger.find({ eventType: 'SaleRecorded', correlationId: String(sold._id) }).lean()
    const net = events.flatMap((e) => e.payload.consumption).filter((c) => c.skuId === carneId).reduce((a, c) => a + c.quantity, 0)
    expect(net).toBeCloseTo(0, 6)
    expect(events.map((e) => e.payload.reason).sort()).toEqual(['cancelled', 'sold'])
  })

  it('confirmar "igual a la base" exige que exista la base', async () => {
    const other = new mongoose.Types.ObjectId().toString()
    const res = await recipesPut(json('PUT', 'recipes', {
      kind: 'dish', locationId: loc._id.toString(), menuItemId: other, variantName: 'Doble', name: 'Otro (Doble)', usesBaseRecipe: true, items: [],
    }), P)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/receta base/)
  })

  it('un plato sin variante descuenta su receta y no lleva marcas', async () => {
    await syncOrderConsumption(order(null))
    const ev: any = await InventoryLedger.findOne({ eventType: 'SaleRecorded' }).lean()
    expect(ev.payload.unmapped).toBe(false)
    expect(ev.payload.unmappedReason).toBeNull()
    expect(ev.payload.variantUsesBase).toBe(false)
  })
})

describe('R2 — montos en pesos solo con `read`', () => {
  it('stripTodayValues quita montos y motivos con $', () => {
    const stripped = stripTodayValues({
      localHour: 12,
      verifications: [{
        skuId: 'a', storageLocationId: 'b', name: 'Carne', unit: 'kg', valueAtRiskCents: 100, interruptionCostCents: 10, scoreCents: 90,
        stockoutProbability: 0, coverageDays: null, stockAlert: null,
        reasons: ['La incertidumbre equivale a $1.000', 'Nunca se contó: falta el conteo inicial'],
        storageName: 'Cocina', mu: 1, sigma: 0, anchored: true,
      }],
      alerts: [],
      totals: { skus: 1, neverCounted: 0, stockValueCents: 5000 },
      untouched: [],
      storages: [],
    } as any)
    const v: any = stripped.verifications[0]
    expect(v.valueAtRiskCents).toBeUndefined()
    expect(v.scoreCents).toBeUndefined()
    expect(v.reasons).toEqual(['Nunca se contó: falta el conteo inicial'])
    expect((stripped.totals as any).stockValueCents).toBeUndefined()
  })

  it('con `read` (jefe de cocina) la lista del día trae los montos', async () => {
    as({ id: 'k1', role: 'kitchen_lead' })
    const res = await todayGet(new NextRequest(`http://localhost/api/${SLUG}/inventory/today?locationId=${loc._id}`), P)
    expect(res.status).toBe(200)
    expect((await res.json()).totals.stockValueCents).toBeTypeOf('number')
  })
})

describe('R3 — runAfterResponse', () => {
  it('fuera de un request corre igual y una falla no se propaga', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let ran = false
    runAfterResponse('ok', async () => { ran = true })
    runAfterResponse('falla', async () => { throw new Error('boom') })
    await new Promise((r) => setTimeout(r, 10))
    expect(ran).toBe(true)
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('falla'), expect.any(Error))
    errSpy.mockRestore()
  })
})

describe('R4 — reparación de proyecciones atrasadas', () => {
  it('un evento insertado sin rebuild se proyecta en el cron; correrlo de nuevo no toca nada', async () => {
    await countsPost(json('POST', 'counts', { skuId: carneId, storageLocationId: storageId, observedQuantity: 10, unit: 'kg', observationMethod: 'manual_scale' }), P)
    const muOf = async () => ((await InventoryState.findOne({ skuId: carneId }).lean()) as any).mu
    expect(await muOf()).toBeCloseTo(10, 6)

    // Simula appendEvents que insertó y se cortó antes del rebuild.
    await new Promise((r) => setTimeout(r, 5))
    await InventoryLedger.create({
      eventId: 'receipt:sin-rebuild-01', tenantId: tenant._id, locationId: loc._id,
      skuId: new mongoose.Types.ObjectId(carneId), storageLocationId: new mongoose.Types.ObjectId(storageId),
      eventType: 'GoodsReceived', occurredAt: new Date(), recordedAt: new Date(), source: 'manual', actorId: 'admin-1',
      payload: { quantity: 5, unit: 'kg', unitCostCents: 800_000 },
    })
    expect(await muOf()).toBeCloseTo(10, 6)

    const first = await repairStaleAggregates({ hours: 36, tenantId: tenant._id.toString() })
    expect(first.repaired).toBeGreaterThanOrEqual(1)
    expect(await muOf()).toBeCloseTo(15, 6)

    const second = await repairStaleAggregates({ hours: 36, tenantId: tenant._id.toString() })
    expect(second.repaired).toBe(0)
  })
})
