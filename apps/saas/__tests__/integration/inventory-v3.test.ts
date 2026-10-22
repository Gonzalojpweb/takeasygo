// ============================================================================
// inventory-v3.test.ts — backend de Inventario V3
// ============================================================================
// Puesta en marcha (off → preparing → active), cobertura real por plato y
// variante, recetas huérfanas (R9), guardado a prueba de cortes (R5),
// centro "Ahora", actividad en lenguaje natural, presentación habitual de
// compra y aislamiento por tenant y sede.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import Order from '@/models/Order'
import User from '@/models/User'
import InventoryLedger from '@/models/InventoryLedger'
import InventoryRecipe from '@/models/InventoryRecipe'
import InventorySKU from '@/models/InventorySKU'
import { auth } from '@/lib/auth'
import { syncOrderConsumption } from '@/lib/inventory/sales'
import { loadCurrentRecipes, dishRecipeKey } from '@/lib/inventory/catalog'
import { GET as setupGet, POST as setupPost } from '@/app/api/[tenant]/inventory/setup/route'
import { PUT as recipesPut, GET as recipesGet, DELETE as recipesDelete } from '@/app/api/[tenant]/inventory/recipes/route'
import { POST as countsPost } from '@/app/api/[tenant]/inventory/counts/route'
import { POST as receiptsPost } from '@/app/api/[tenant]/inventory/receipts/route'
import { POST as skusPost } from '@/app/api/[tenant]/inventory/skus/route'
import { GET as overviewGet } from '@/app/api/[tenant]/inventory/overview/route'
import { GET as activityGet } from '@/app/api/[tenant]/inventory/activity/route'

const SLUG = 'inv-v3'
let tenant: any
let loc: any
let otherLoc: any
let adminId: string
const BURGER = new mongoose.Types.ObjectId()
const SALAD = new mongoose.Types.ObjectId()
const GONE = new mongoose.Types.ObjectId().toString()

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

async function createSku(name: string, unit: string, cost = 0) {
  const res = await skusPost(json('POST', 'skus', { name, category: 'other', canonicalUnit: unit, lastUnitCostCents: cost }), P)
  return (await res.json()).sku._id as string
}

function sale(variantName: string | null, over: Record<string, unknown> = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    tenantId: tenant._id,
    locationId: loc._id,
    orderNumber: 'V3-1',
    status: 'confirmed',
    posId: 'pos-v3',
    statusTimestamps: { confirmedAt: new Date() },
    items: [{ _id: new mongoose.Types.ObjectId(), menuItemId: BURGER.toString(), name: 'Hamburguesa', quantity: 1, selectedVariant: variantName ? { name: variantName } : null, customizations: [] }],
    ...over,
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({ slug: SLUG, name: 'V3', isActive: true, status: 'active', plan: 'full' })
  loc = await Location.create({ tenantId: tenant._id, slug: 'centro', name: 'Centro', address: 'X', isActive: true })
  otherLoc = await Location.create({ tenantId: tenant._id, slug: 'norte', name: 'Norte', address: 'Y', isActive: true })
  const admin = await User.create({ name: 'Ana Admin', email: 'ana@v3.test', password: 'x'.repeat(20), role: 'admin', tenantId: tenant._id })
  adminId = String(admin._id)
  await Menu.create({
    tenantId: tenant._id,
    locationId: loc._id,
    categories: [{
      _id: new mongoose.Types.ObjectId(),
      name: 'Platos',
      items: [
        { _id: BURGER, name: 'Hamburguesa', price: 900_000, variants: [{ name: 'Simple', price: 900_000 }, { name: 'Doble', price: 1_200_000 }] },
        { _id: SALAD, name: 'Ensalada', price: 600_000 },
      ],
    }],
  })
  as({ id: adminId, role: 'admin' })
})

describe('puesta en marcha: off → preparing → active', () => {
  it('preparar no hace descontar; activar sí. El jefe de cocina no cambia el estado', async () => {
    let status = await (await setupGet(get('setup'), P)).json()
    expect(status.locations.find((l: any) => l.id === String(loc._id)).status).toBe('off')

    as({ id: 'k1', role: 'kitchen_lead' })
    expect((await setupPost(json('POST', 'setup', { locationId: String(loc._id), mode: 'prepare' }), P)).status).toBe(403)

    as({ id: adminId, role: 'admin' })
    const prep = await setupPost(json('POST', 'setup', { locationId: String(loc._id), mode: 'prepare' }), P)
    expect((await prep.json()).status).toBe('preparing')
    status = await (await setupGet(get('setup'), P)).json()
    expect(status.locations.find((l: any) => l.id === String(loc._id))).toMatchObject({ status: 'preparing', inventoryActive: false })

    const carne = await createSku('Carne', 'kg')
    await recipesPut(json('PUT', 'recipes', { kind: 'dish', locationId: String(loc._id), menuItemId: BURGER.toString(), name: 'Hamburguesa', items: [{ skuId: carne, quantity: 150, unit: 'g' }] }), P)

    // En preparación: se puede contar, pero las ventas NO descuentan.
    const storage = (await (await setupPost(json('POST', 'setup', { locationId: String(loc._id), mode: 'none' }), P)).json()).storageLocationId
    expect((await countsPost(json('POST', 'counts', { skuId: carne, storageLocationId: storage, observedQuantity: 10, unit: 'kg', observationMethod: 'manual_scale' }), P)).status).toBe(201)
    expect((await syncOrderConsumption(sale(null))).skipped).toBe('no_inventory')

    // Activar: el jefe de cocina no puede; el admin sí. Desde ahí descuenta.
    as({ id: 'k1', role: 'kitchen_lead' })
    expect((await setupPost(json('POST', 'setup', { locationId: String(loc._id), mode: 'activate' }), P)).status).toBe(403)
    as({ id: adminId, role: 'admin' })
    expect((await (await setupPost(json('POST', 'setup', { locationId: String(loc._id), mode: 'activate' }), P)).json()).status).toBe('active')
    expect((await syncOrderConsumption(sale(null))).events).toBe(1)
  })

  it('mode "none" no crea ni activa una sede sin inventario', async () => {
    expect((await setupPost(json('POST', 'setup', { locationId: String(loc._id), mode: 'none' }), P)).status).toBe(409)
  })
})

describe('cobertura real por plato y variante', () => {
  it('distingue sin receta, variantes pendientes, falta conteo y controlado; ordena por ventas', async () => {
    await setupPost(json('POST', 'setup', { locationId: String(loc._id) }), P)
    const carne = await createSku('Carne', 'kg')
    const lechuga = await createSku('Lechuga', 'kg')
    await recipesPut(json('PUT', 'recipes', { kind: 'dish', locationId: String(loc._id), menuItemId: BURGER.toString(), name: 'Hamburguesa', items: [{ skuId: carne, quantity: 150, unit: 'g' }] }), P)
    await recipesPut(json('PUT', 'recipes', { kind: 'dish', locationId: String(loc._id), menuItemId: SALAD.toString(), name: 'Ensalada', items: [{ skuId: lechuga, quantity: 100, unit: 'g' }] }), P)
    // Ventas crudas para el ranking (la agregación solo lee estos campos).
    await Order.collection.insertOne({ tenantId: tenant._id, locationId: loc._id, status: 'delivered', createdAt: new Date(), items: [{ menuItemId: SALAD, quantity: 5, selectedVariant: null }] })

    let view = await (await recipesGet(get(`recipes?locationId=${loc._id}`), P)).json()
    const burger = view.items.find((i: any) => i.menuItemId === BURGER.toString())
    const salad = view.items.find((i: any) => i.menuItemId === SALAD.toString())
    expect(view.items[0].menuItemId).toBe(SALAD.toString()) // la más vendida primero
    expect(salad.soldLast30d).toBe(5)
    expect(burger.coverage).toBe('variants_pending')
    expect(burger.variantStates.map((v: any) => v.status)).toEqual(['variant_unconfirmed', 'variant_unconfirmed'])
    expect(salad.coverage).toBe('needs_counts')
    expect(salad.missingCounts.map((m: any) => m.name)).toEqual(['Lechuga'])

    const storage = (await (await setupPost(json('POST', 'setup', { locationId: String(loc._id), mode: 'none' }), P)).json()).storageLocationId
    await countsPost(json('POST', 'counts', { skuId: lechuga, storageLocationId: storage, observedQuantity: 3, unit: 'kg', observationMethod: 'manual_scale' }), P)
    view = await (await recipesGet(get(`recipes?locationId=${loc._id}`), P)).json()
    expect(view.items.find((i: any) => i.menuItemId === SALAD.toString()).coverage).toBe('controlled')
    expect(view.coverage).toMatchObject({ total: 2, controlled: 1, variantsPending: 1, noRecipe: 0 })
  })
})

describe('R9 — recetas huérfanas', () => {
  it('detecta recetas de platos o variantes que ya no están en el menú', async () => {
    const carne = await createSku('Carne', 'kg')
    await recipesPut(json('PUT', 'recipes', { kind: 'dish', locationId: String(loc._id), menuItemId: BURGER.toString(), name: 'Hamburguesa', items: [{ skuId: carne, quantity: 150, unit: 'g' }] }), P)
    await recipesPut(json('PUT', 'recipes', { kind: 'dish', locationId: String(loc._id), menuItemId: BURGER.toString(), variantName: 'Triple', name: 'Hamburguesa (Triple)', items: [{ skuId: carne, quantity: 450, unit: 'g' }] }), P)
    await recipesPut(json('PUT', 'recipes', { kind: 'dish', locationId: String(loc._id), menuItemId: GONE, name: 'Plato viejo', items: [{ skuId: carne, quantity: 100, unit: 'g' }] }), P)
    const view = await (await recipesGet(get(`recipes?locationId=${loc._id}`), P)).json()
    const reasons = Object.fromEntries(view.orphans.map((o: any) => [o.name, o.reason]))
    expect(reasons).toEqual({ 'Hamburguesa (Triple)': 'variant_missing', 'Plato viejo': 'dish_missing' })

    // Quitar una huérfana la saca de la lista.
    const triple = view.orphans.find((o: any) => o.variantName === 'Triple')
    expect((await recipesDelete(new NextRequest(`http://localhost/api/${SLUG}/inventory/recipes?recipeKey=${encodeURIComponent(triple.recipeKey)}`, { method: 'DELETE' }), P)).status).toBe(200)
    const after = await (await recipesGet(get(`recipes?locationId=${loc._id}`), P)).json()
    expect(after.orphans.map((o: any) => o.name)).toEqual(['Plato viejo'])
  })
})

describe('R5 — guardado de recetas a prueba de cortes', () => {
  it('si el guardado se corta entre despublicar y publicar, la versión nueva rige (y se repara)', async () => {
    await setupPost(json('POST', 'setup', { locationId: String(loc._id) }), P)
    const carne = await createSku('Carne', 'kg')
    await recipesPut(json('PUT', 'recipes', { kind: 'dish', locationId: String(loc._id), menuItemId: BURGER.toString(), name: 'Hamburguesa', items: [{ skuId: carne, quantity: 150, unit: 'g' }] }), P)
    const key = dishRecipeKey(String(loc._id), BURGER.toString(), null)

    // Simula el corte: v2 creada SIN vigencia y v1 ya despublicada.
    await InventoryRecipe.updateOne({ recipeKey: key, version: 1 }, { $set: { isCurrent: false } })
    await InventoryRecipe.create({
      tenantId: tenant._id, locationId: loc._id, kind: 'dish', recipeKey: key, name: 'Hamburguesa', menuItemId: BURGER.toString(),
      variantName: null, items: [{ skuId: carne, quantity: 200, unit: 'g' }], version: 2, isCurrent: false,
    })

    const current = await loadCurrentRecipes(tenant._id, { recipeKeys: [key] })
    expect(current.get(key)?.version).toBe(2)
    expect((await InventoryRecipe.findOne({ recipeKey: key, version: 2 }).lean())?.isCurrent).toBe(true) // reparada
    await syncOrderConsumption(sale(null))
    const ev: any = await InventoryLedger.findOne({ eventType: 'SaleRecorded' }).lean()
    expect(ev.payload.consumption[0].quantity).toBeCloseTo(0.2, 6)
  })

  it('una receta quitada sigue quitada (no se "repara")', async () => {
    const carne = await createSku('Carne', 'kg')
    await recipesPut(json('PUT', 'recipes', { kind: 'dish', locationId: String(loc._id), menuItemId: SALAD.toString(), name: 'Ensalada', items: [{ skuId: carne, quantity: 100, unit: 'g' }] }), P)
    const key = dishRecipeKey(String(loc._id), SALAD.toString(), null)
    await recipesDelete(new NextRequest(`http://localhost/api/${SLUG}/inventory/recipes?recipeKey=${encodeURIComponent(key)}`, { method: 'DELETE' }), P)
    expect((await loadCurrentRecipes(tenant._id, { recipeKeys: [key] })).has(key)).toBe(false)
  })

  it('guardar versiona: la nueva queda vigente y la anterior histórica', async () => {
    const carne = await createSku('Carne', 'kg')
    const body = (q: number) => ({ kind: 'dish', locationId: String(loc._id), menuItemId: SALAD.toString(), name: 'Ensalada', items: [{ skuId: carne, quantity: q, unit: 'g' }] })
    await recipesPut(json('PUT', 'recipes', body(100)), P)
    await recipesPut(json('PUT', 'recipes', body(120)), P)
    const all = await InventoryRecipe.find({ menuItemId: SALAD.toString() }).sort({ version: 1 }).lean()
    expect(all.map((r) => [r.version, r.isCurrent])).toEqual([[1, false], [2, true]])
  })

  it('una receta de plato sin insumos se rechaza (salvo variante "igual a la base")', async () => {
    const res = await recipesPut(json('PUT', 'recipes', { kind: 'dish', locationId: String(loc._id), menuItemId: SALAD.toString(), name: 'Ensalada', items: [] }), P)
    expect(res.status).toBe(400)
  })
})

describe('centro "Ahora"', () => {
  it('sede sin inventario: sin tareas, con platos para empezar', async () => {
    const o = await (await overviewGet(get(`overview?locationId=${loc._id}`), P)).json()
    expect(o.status).toBe('off')
    expect(o.tasks).toEqual([])
    expect(o.dishesToSetup.map((d: any) => d.name).sort()).toEqual(['Ensalada', 'Hamburguesa'])
  })

  it('sede activa: cada tarea trae su acción (faltante → contar; variante vendida sin confirmar → receta)', async () => {
    await setupPost(json('POST', 'setup', { locationId: String(loc._id) }), P)
    const carne = await createSku('Carne', 'kg', 800_000)
    await recipesPut(json('PUT', 'recipes', { kind: 'dish', locationId: String(loc._id), menuItemId: BURGER.toString(), name: 'Hamburguesa', items: [{ skuId: carne, quantity: 150, unit: 'g' }] }), P)
    await syncOrderConsumption(sale(null)) // base: carne nunca contada → negativa
    await syncOrderConsumption(sale('Doble')) // variante sin confirmar → no descuenta

    const o = await (await overviewGet(get(`overview?locationId=${loc._id}`), P)).json()
    expect(o.status).toBe('active')
    const neg = o.tasks.find((t: any) => t.id.startsWith('neg:'))
    expect(neg).toMatchObject({ level: 'urgent', action: { type: 'count', skuId: carne } })
    const pending = o.tasks.find((t: any) => t.id.startsWith('sale:'))
    expect(pending).toMatchObject({ action: { type: 'recipe', menuItemId: BURGER.toString(), variantName: 'Doble' } })
    expect(pending.title).toMatch(/Doble.*confirmar/)
    for (const t of o.tasks) expect(t.actionLabel.length).toBeGreaterThan(0)
  })
})

describe('actividad en lenguaje natural', () => {
  it('cuenta qué pasó, quién y cuánto; pagina sin saltear eventos de la misma hora', async () => {
    await setupPost(json('POST', 'setup', { locationId: String(loc._id) }), P)
    const carne = await createSku('Carne', 'kg', 800_000)
    const storage = (await (await setupPost(json('POST', 'setup', { locationId: String(loc._id), mode: 'none' }), P)).json()).storageLocationId
    await receiptsPost(json('POST', 'receipts', { clientEventId: 'rcv-v3-0001', skuId: carne, storageLocationId: storage, quantity: 2, unit: 'caja', pack: { quantity: 5, unit: 'kg' }, totalCostCents: 9_000_000, supplierName: 'Frigorífico' }), P)
    await recipesPut(json('PUT', 'recipes', { kind: 'dish', locationId: String(loc._id), menuItemId: BURGER.toString(), name: 'Hamburguesa', items: [{ skuId: carne, quantity: 150, unit: 'g' }] }), P)
    const sold = sale(null)
    await syncOrderConsumption(sold)
    await syncOrderConsumption({ ...sold, status: 'cancelled' })

    const res = await activityGet(get(`activity?locationId=${loc._id}&limit=10`), P)
    const { entries } = await res.json()
    const titles = entries.map((e: any) => e.title)
    expect(titles).toEqual(expect.arrayContaining(['Mercadería recibida', 'Venta registrada', 'Consumo revertido']))
    const receipt = entries.find((e: any) => e.kind === 'receipt')
    expect(receipt.actor).toBe('Ana Admin')
    expect(receipt.lines[0]).toMatchObject({ skuName: 'Carne', delta: 10, unit: 'kg' })
    expect(receipt.unitCostCents).toBe(900_000)
    expect(entries.find((e: any) => e.kind === 'sale').actor).toBe('Automático')
    expect(entries.find((e: any) => e.kind === 'sale_reverted').detail).toMatch(/cancelado/)

    // Cursor estable: con límite 1 se recorren todos sin repetir ni saltear.
    const seen: string[] = []
    let before: string | null = null
    for (let i = 0; i < 10; i++) {
      const page: any = await (await activityGet(get(`activity?locationId=${loc._id}&limit=1${before ? `&before=${encodeURIComponent(before)}` : ''}`), P)).json()
      seen.push(...page.entries.map((e: any) => e.id))
      if (!page.nextBefore) break
      before = page.nextBefore
    }
    expect(new Set(seen).size).toBe(entries.length)
  })

  it('aislamiento: otra sede responde 404 y otro comercio no ve nada', async () => {
    as({ id: 'm2', role: 'manager', assignedLocations: [String(otherLoc._id)] })
    expect((await activityGet(get(`activity?locationId=${loc._id}`), P)).status).toBe(404)

    const other = await Tenant.create({ slug: 'otro-comercio', name: 'Otro', isActive: true, status: 'active', plan: 'full' })
    await InventoryLedger.create({
      eventId: 'receipt:otro-0001', tenantId: other._id, locationId: loc._id, skuId: new mongoose.Types.ObjectId(), storageLocationId: new mongoose.Types.ObjectId(),
      eventType: 'GoodsReceived', occurredAt: new Date(), recordedAt: new Date(), source: 'manual', actorId: null, payload: { quantity: 1, unit: 'kg' },
    })
    as({ id: adminId, role: 'admin' })
    const { entries } = await (await activityGet(get(`activity?locationId=${loc._id}`), P)).json()
    expect(entries).toEqual([])
  })
})

describe('recepción: presentación habitual', () => {
  it('la última presentación queda recordada en el insumo', async () => {
    await setupPost(json('POST', 'setup', { locationId: String(loc._id) }), P)
    const carne = await createSku('Carne', 'kg')
    const storage = (await (await setupPost(json('POST', 'setup', { locationId: String(loc._id), mode: 'none' }), P)).json()).storageLocationId
    await receiptsPost(json('POST', 'receipts', { clientEventId: 'rcv-pack-0001', skuId: carne, storageLocationId: storage, quantity: 3, unit: 'cajón', pack: { quantity: 18, unit: 'kg' } }), P)
    const sku: any = await InventorySKU.findById(carne).lean()
    expect(sku.lastPack).toEqual({ label: 'cajón', quantity: 18, unit: 'kg' })
  })
})
