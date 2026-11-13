// ============================================================================
// inventory-profitability.test.ts — GET /api/[tenant]/inventory/profitability
// ============================================================================
// Rentabilidad de una sede con el costo promedio del depósito de consumo,
// comparación entre sedes (mismo plato, costos distintos), alcance por sede y
// roles.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import User from '@/models/User'
import InventoryState from '@/models/InventoryState'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import { auth } from '@/lib/auth'
import { PUT as recipesPut } from '@/app/api/[tenant]/inventory/recipes/route'
import { POST as skusPost } from '@/app/api/[tenant]/inventory/skus/route'
import { GET as profitGet } from '@/app/api/[tenant]/inventory/profitability/route'

const SLUG = 'inv-profit'
let tenant: any
let centro: any
let norte: any
let adminId: string
let carne: string

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
const get = (path: string) => new NextRequest(`http://localhost/api/${SLUG}/inventory/${path}`)

async function menuFor(location: any, burgerPrice: number) {
  const burger = new mongoose.Types.ObjectId()
  await Menu.create({
    tenantId: tenant._id,
    locationId: location._id,
    categories: [{ _id: new mongoose.Types.ObjectId(), name: 'Platos', items: [{ _id: burger, name: 'Hamburguesa', price: burgerPrice }] }],
  })
  return burger.toString()
}

/** Costo promedio de la carne en un depósito de la sede (centavos por kg). */
async function costAt(location: any, cents: number, consumption: boolean) {
  const storage = await InventoryStorageLocation.create({ tenantId: tenant._id, locationId: location._id, name: consumption ? 'Cocina' : 'Depósito', type: consumption ? 'kitchen' : 'dry_storage', isDefaultConsumption: consumption })
  await InventoryState.create({ tenantId: tenant._id, locationId: location._id, skuId: carne, storageLocationId: storage._id, avgUnitCostCents: cents })
}

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({ slug: SLUG, name: 'Profit', isActive: true, status: 'active', plan: 'full' })
  centro = await Location.create({ tenantId: tenant._id, slug: 'centro', name: 'Centro', address: 'X', isActive: true })
  norte = await Location.create({ tenantId: tenant._id, slug: 'norte', name: 'Norte', address: 'Y', isActive: true })
  const admin = await User.create({ name: 'Ana', email: 'ana@profit.test', password: 'x'.repeat(20), role: 'admin', tenantId: tenant._id })
  adminId = String(admin._id)
  as({ id: adminId, role: 'admin' })
  carne = (await (await skusPost(json('POST', 'skus', { name: 'Carne', category: 'other', canonicalUnit: 'kg', lastUnitCostCents: 100_000 }), P)).json()).sku._id
})

async function setupBothLocations() {
  const bCentro = await menuFor(centro, 1_000_000) // $10.000
  const bNorte = await menuFor(norte, 1_000_000)
  for (const [loc, id] of [[centro, bCentro], [norte, bNorte]] as const) {
    await recipesPut(json('PUT', 'recipes', { kind: 'dish', locationId: String(loc._id), menuItemId: id, name: 'Hamburguesa', items: [{ skuId: carne, quantity: 200, unit: 'g' }] }), P)
  }
  // Centro: el depósito de consumo pagó $15.000/kg (otro depósito, $50.000: no cuenta).
  await costAt(centro, 5_000_000, false)
  await costAt(centro, 1_500_000, true)
  // Norte: $20.000/kg.
  await costAt(norte, 2_000_000, true)
}

describe('rentabilidad de una sede', () => {
  it('usa el costo del depósito de consumo y calcula margen y food cost', async () => {
    await setupBothLocations()
    const res = await profitGet(get(`profitability?locationId=${centro._id}`), P)
    expect(res.status).toBe(200)
    const body = await res.json()
    // 0,2 kg × $15.000 = $3.000 → 30% de $10.000.
    expect(body.rows[0]).toMatchObject({ name: 'Hamburguesa', costCents: 300_000, marginCents: 700_000, foodCostPct: 30, status: 'healthy' })
    expect(body.summary).toMatchObject({ dishes: 1, costed: 1 })
  })

  it('sin locationId → 400; sede fuera del alcance → 404', async () => {
    expect((await profitGet(get('profitability'), P)).status).toBe(400)
    as({ id: 'm1', role: 'manager', assignedLocations: [String(norte._id)] })
    expect((await profitGet(get(`profitability?locationId=${centro._id}`), P)).status).toBe(404)
  })

  it('cajero y mozo no ven costos', async () => {
    for (const role of ['cashier', 'waiter', 'staff']) {
      as({ id: 'x', role })
      expect((await profitGet(get(`profitability?locationId=${centro._id}`), P)).status).toBe(403)
    }
  })
})

describe('comparar sedes', () => {
  it('el mismo plato con costos distintos por sede', async () => {
    await setupBothLocations()
    const body = await (await profitGet(get('profitability?compare=1'), P)).json()
    expect(body.locations.map((l: any) => l.name)).toEqual(['Centro', 'Norte'])
    expect(body.rows).toHaveLength(1)
    const row = body.rows[0]
    expect(row.cells.map((c: any) => c.costCents)).toEqual([300_000, 400_000])
    expect(row).toMatchObject({ costSpreadCents: 100_000, priciestLocationId: String(norte._id), marginSpreadPts: 10 })
  })

  it('un encargado de una sede solo compara lo suyo (no ve la otra)', async () => {
    await setupBothLocations()
    as({ id: 'm1', role: 'manager', assignedLocations: [String(norte._id)] })
    const body = await (await profitGet(get('profitability?compare=1'), P)).json()
    expect(body.locations.map((l: any) => l.name)).toEqual(['Norte'])
    expect(body.rows).toHaveLength(0)
  })

  it('no mezcla sedes de otro comercio', async () => {
    await setupBothLocations()
    const other = await Tenant.create({ slug: 'otro', name: 'Otro', isActive: true, status: 'active', plan: 'full' })
    await Location.create({ tenantId: other._id, slug: 'ajena', name: 'Ajena', address: 'Z', isActive: true })
    const body = await (await profitGet(get('profitability?compare=1'), P)).json()
    expect(body.locations.map((l: any) => l.name)).toEqual(['Centro', 'Norte'])
  })
})
