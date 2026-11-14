// ============================================================================
// inventory-guide-fixes.test.ts — bugs del caso La Pescería (13/11/2026)
// ============================================================================
// 1. Con el índice viejo `tenantId_1_skuCode_1` (único + sparse) no se podía
//    crear un segundo insumo sin código: «Ya existe un insumo "boquerones"».
// 2. Un nombre repetido (activo o desactivado) devolvía un error sin salida.
// 3. Quitar la receta dejaba el plato pausado «por stock» para siempre, y
//    cambiar la receta no recalculaba la carta hasta la próxima venta.
// 4. La guía en vivo explica el «Sin inventario» con los números reales.
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
import InventorySKU from '@/models/InventorySKU'
import { auth } from '@/lib/auth'
import { POST as setupPost } from '@/app/api/[tenant]/inventory/setup/route'
import { PUT as recipesPut, DELETE as recipesDelete } from '@/app/api/[tenant]/inventory/recipes/route'
import { POST as countsPost } from '@/app/api/[tenant]/inventory/counts/route'
import { POST as skusPost } from '@/app/api/[tenant]/inventory/skus/route'
import { GET as coachGet } from '@/app/api/[tenant]/inventory/coach/route'
import { dishRecipeKey } from '@/lib/inventory/catalog'

const SLUG = 'la-pesce-test'
let tenant: any
let loc: any
const MEJILLONES = new mongoose.Types.ObjectId()
const BOQUERONES = new mongoose.Types.ObjectId()

const P = { params: Promise.resolve({ tenant: SLUG }) }
const json = (method: string, path: string, body?: unknown) =>
  new NextRequest(`http://localhost/api/${SLUG}/inventory/${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const get = (path: string) => new NextRequest(`http://localhost/api/${SLUG}/inventory/${path}`)
const postSku = (name: string, unit = 'unit') => skusPost(json('POST', 'skus', { name, category: 'fish_seafood', canonicalUnit: unit }), P)

async function dishState(id: mongoose.Types.ObjectId) {
  const menu = (await Menu.findOne({ tenantId: tenant._id }).lean()) as any
  return menu.categories[0].items.find((i: any) => String(i._id) === String(id))
}

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({ slug: SLUG, name: 'La Pesce', isActive: true, status: 'active', plan: 'full' })
  loc = await Location.create({ tenantId: tenant._id, slug: 'centro', name: 'Centro', address: 'X', isActive: true })
  const admin = await User.create({ name: 'Ana', email: 'ana@pesce.test', password: 'x'.repeat(20), role: 'admin', tenantId: tenant._id })
  await Menu.create({
    tenantId: tenant._id,
    locationId: loc._id,
    categories: [{
      _id: new mongoose.Types.ObjectId(),
      name: 'Mariscos',
      items: [
        { _id: MEJILLONES, name: 'Mejillones rebozados', price: 1_500_000 },
        { _id: BOQUERONES, name: 'Boquerones a la provenzal', price: 1_400_000 },
      ],
    }],
  })
  vi.mocked(auth).mockResolvedValue({ user: { id: String(admin._id), role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [] }, expires: '' } as any)
})

describe('alta de insumos', () => {
  it('con el índice viejo sparse en la base, el segundo insumo sin código se crea igual (y el índice se borra solo)', async () => {
    await InventorySKU.init()
    await InventorySKU.collection.createIndex({ tenantId: 1, skuCode: 1 }, { unique: true, sparse: true, name: 'tenantId_1_skuCode_1' })
    try {
      expect((await postSku('MEJILLONES')).status).toBe(201)
      const res = await postSku('boquerones')
      expect(res.status).toBe(201)
      expect((await res.json()).outcome).toBe('created')
      const docs = await InventorySKU.find({ tenantId: tenant._id }).lean()
      expect(docs).toHaveLength(2)
      expect(docs.every((d: any) => !('skuCode' in d))).toBe(true)
      expect((await InventorySKU.collection.indexes()).some((i) => i.name === 'tenantId_1_skuCode_1')).toBe(false)
    } finally {
      await InventorySKU.collection.dropIndex('tenantId_1_skuCode_1').catch(() => {})
    }
  })

  it('un nombre que ya existe devuelve ese insumo; uno desactivado se reactiva', async () => {
    const first = await (await postSku('Boquerones')).json()
    const again = await postSku('  boquerónes ')
    expect(again.status).toBe(200)
    const body = await again.json()
    expect(body.outcome).toBe('existing')
    expect(body.sku._id).toBe(first.sku._id)

    await InventorySKU.updateOne({ _id: first.sku._id }, { $set: { isActive: false } })
    const back = await (await postSku('BOQUERONES')).json()
    expect(back.outcome).toBe('reactivated')
    expect((await InventorySKU.findById(first.sku._id).lean())!.isActive).toBe(true)
  })

  it('un código repetido explica que es el código, no el nombre', async () => {
    await skusPost(json('POST', 'skus', { name: 'Merluza', category: 'fish_seafood', canonicalUnit: 'kg', skuCode: 'M1' }), P)
    const res = await skusPost(json('POST', 'skus', { name: 'Abadejo', category: 'fish_seafood', canonicalUnit: 'kg', skuCode: 'M1' }), P)
    expect(res.status).toBe(409)
    expect((await res.json()).error ?? '').toMatch(/código «M1»/)
  })
})

describe('carta ↔ receta (pausa por stock)', () => {
  it('receta de 20 con 12 en stock pausa; quitar la receta reanuda; una receta posible reanuda al guardar', async () => {
    await setupPost(json('POST', 'setup', { locationId: String(loc._id), mode: 'prepare' }), P)
    const storage = (await (await setupPost(json('POST', 'setup', { locationId: String(loc._id), mode: 'none' }), P)).json()).storageLocationId
    const mej = (await (await postSku('MEJILLONES')).json()).sku._id
    const recipe = (quantity: number) =>
      recipesPut(json('PUT', 'recipes', { kind: 'dish', locationId: String(loc._id), menuItemId: MEJILLONES.toString(), name: 'Mejillones rebozados', items: [{ skuId: mej, quantity, unit: 'unit' }] }), P)

    await recipe(20)
    await countsPost(json('POST', 'counts', { skuId: mej, storageLocationId: storage, observedQuantity: 12, unit: 'unit', observationMethod: 'visual_count' }), P)
    expect(await dishState(MEJILLONES)).toMatchObject({ isAvailable: true }) // en preparación la carta no se toca

    // La guía avisa ANTES de activar.
    const before = await (await coachGet(get(`coach?locationId=${loc._id}`), P)).json()
    expect(before.findings.find((f: any) => f.id === `short:${MEJILLONES}`)?.level).toBe('warn')

    // Al activar, se pausa en el momento (no después de vender en negativo).
    await setupPost(json('POST', 'setup', { locationId: String(loc._id), mode: 'activate' }), P)
    expect(await dishState(MEJILLONES)).toMatchObject({ isAvailable: false, pausedReason: 'stock', stockPortions: 0 })

    // La guía lo explica con los números.
    const coach = await (await coachGet(get(`coach?locationId=${loc._id}`), P)).json()
    const short = coach.findings.find((f: any) => f.id === `short:${MEJILLONES}`)
    expect(short.what).toContain('20 unidades de MEJILLONES por plato')
    expect(short.what).toContain('hay 12 unidades')

    // Corregir la receta a 4 por plato: vuelve a la carta al guardar, sin esperar una venta.
    await recipe(4)
    expect(await dishState(MEJILLONES)).toMatchObject({ isAvailable: true, pausedReason: null, stockPortions: 3 })

    // Volver a 20: se pausa al guardar.
    await recipe(20)
    expect(await dishState(MEJILLONES)).toMatchObject({ isAvailable: false, pausedReason: 'stock' })

    // Quitar la receta: la pausa por stock ya no tiene sentido.
    const key = dishRecipeKey(String(loc._id), MEJILLONES.toString(), null)
    expect((await recipesDelete(json('DELETE', `recipes?recipeKey=${encodeURIComponent(key)}`), P)).status).toBe(200)
    expect(await dishState(MEJILLONES)).toMatchObject({ isAvailable: true, pausedReason: null, stockPortions: null })
  })

  it('una pausa manual nunca se levanta sola', async () => {
    await setupPost(json('POST', 'setup', { locationId: String(loc._id), mode: 'prepare' }), P)
    await Menu.updateOne(
      { tenantId: tenant._id },
      { $set: { 'categories.0.items.$[i].isAvailable': false, 'categories.0.items.$[i].pausedReason': 'manual' } },
      { arrayFilters: [{ 'i._id': BOQUERONES }] },
    )
    const boq = (await (await postSku('Boquerones')).json()).sku._id
    await recipesPut(json('PUT', 'recipes', { kind: 'dish', locationId: String(loc._id), menuItemId: BOQUERONES.toString(), name: 'Boquerones', items: [{ skuId: boq, quantity: 6, unit: 'unit' }] }), P)
    const key = dishRecipeKey(String(loc._id), BOQUERONES.toString(), null)
    await recipesDelete(json('DELETE', `recipes?recipeKey=${encodeURIComponent(key)}`), P)
    expect(await dishState(BOQUERONES)).toMatchObject({ isAvailable: false, pausedReason: 'manual' })
  })
})
