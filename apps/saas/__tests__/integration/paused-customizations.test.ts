// ============================================================================
// paused-customizations.test.ts — personalizaciones ocultas en «Artículos pausados»
// ============================================================================
// 10/11/2026: la vista listaba ítems y categorías pausados pero no los grupos,
// opciones y variantes ocultos. Ahora los arma lib/menu/paused-customizations
// (misma semántica que el menú público) y se reactivan con enable* en los PUT
// de categoría e ítem, que quitan la entrada sobre el menú recién leído.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/translate', () => ({ translateToEnglish: vi.fn().mockResolvedValue('') }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import { PUT as updateCategory } from '@/app/api/[tenant]/menu/categories/[categoryId]/route'
import { PUT as updateItem } from '@/app/api/[tenant]/menu/categories/[categoryId]/items/route'
import { collectPausedCustomizations } from '@/lib/menu/paused-customizations'
import { auth } from '@/lib/auth'

const SLUG = 'paused-cust'
let tenant: any
let loc: any
let pizzasId: string
let muzzaId: string
let empanadaId: string
let salsaOptionId: string

const salsas = (name = 'Salsas') => ({
  name, type: 'multiple', required: false,
  options: [{ name: 'Picante', extraPrice: 0 }, { name: 'Ajo', extraPrice: 0 }],
})

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({ slug: SLUG, name: 'Paused', isActive: true, status: 'active', plan: 'full' })
  loc = await Location.create({ tenantId: tenant._id, slug: 'centro', name: 'Centro', address: 'A', isActive: true })
  const menu = await Menu.create({
    tenantId: tenant._id,
    locationId: loc._id,
    categories: [{
      name: 'Pizzas', sortOrder: 0,
      customizationGroups: [salsas()],
      disabledGroupIds: [],
      disabledOptionIds: ['Picante'],
      items: [{
        name: 'Muzza', price: 100000, isAvailable: true,
        variants: [{ name: 'Chica', price: 90000 }, { name: 'Grande', price: 120000 }],
        customizationGroups: [{ name: 'Borde', type: 'single', required: false, options: [{ name: 'Relleno', extraPrice: 5000 }] }],
        disabledVariantNames: ['Chica'],
        disabledGroupIds: ['Borde'],
        disabledOptionIds: [],
      }],
      subcategories: [{
        name: 'Empanadas', sortOrder: 0,
        customizationGroups: [{ name: 'Dips', type: 'single', required: false, options: [{ name: 'Chimichurri', extraPrice: 0 }] }],
        items: [{ name: 'Carne', price: 50000, isAvailable: true, customizationGroups: [], disabledOptionIds: ['Chimichurri', 'Opción borrada'] }],
      }],
    }],
  })
  const cat = menu.categories[0] as any
  pizzasId = String(cat._id)
  muzzaId = String(cat.items[0]._id)
  empanadaId = String(cat.subcategories[0].items[0]._id)
  salsaOptionId = String(cat.customizationGroups[0].options[1]._id)
  vi.mocked(auth).mockResolvedValue({
    user: { id: 'a1', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [] },
    expires: '',
  } as any)
})

const freshCategory = async () => ((await Menu.findOne({ locationId: loc._id }).lean()) as any).categories[0]
const list = async () => collectPausedCustomizations([await freshCategory()], { id: String(loc._id), name: 'Centro' })

function put(handler: typeof updateCategory, path: string, body: Record<string, unknown>) {
  return handler(
    new NextRequest(`http://localhost/api/${SLUG}/menu/categories/${path}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locationId: String(loc._id), ...body }),
    }),
    { params: Promise.resolve({ tenant: SLUG, categoryId: pizzasId }) },
  )
}

describe('Lista de personalizaciones ocultas', () => {
  it('incluye las de categoría (con alcance a subcategorías), ítem, subcategoría y variantes', async () => {
    const entries = await list()
    const summary = entries.map((e) => [e.owner, e.kind, e.label, e.itemName, e.subcategoryName, e.foundIn.length > 0])
    expect(summary).toEqual([
      ['category', 'option', 'Picante', null, null, true],
      ['item', 'variant', 'Chica', 'Muzza', null, true],
      ['item', 'group', 'Borde', 'Muzza', null, true],
      ['item', 'option', 'Chimichurri', 'Carne', 'Empanadas', true],
      ['item', 'option', 'Opción borrada', 'Carne', 'Empanadas', false],
    ])
    const picante = entries[0]
    expect(picante.parentGroups).toEqual(['Salsas'])
    expect(picante.foundIn).toEqual(['Categoría'])
    expect(entries[3].foundIn).toEqual(['Subcategoría Empanadas'])
    expect(entries[2].foundIn).toEqual(['Ítem'])
  })

  it('una clave guardada como _id (datos viejos) se muestra con el nombre actual', async () => {
    await Menu.updateOne({ locationId: loc._id }, { $set: { 'categories.0.disabledOptionIds': [salsaOptionId] } })
    const [entry] = await list()
    expect(entry.key).toBe(salsaOptionId)
    expect(entry.label).toBe('Ajo')
  })
})

describe('Reactivar desde la vista', () => {
  it('categoría: quita solo esa opción de la lista de ocultos', async () => {
    await Menu.updateOne({ locationId: loc._id }, { $set: { 'categories.0.disabledOptionIds': ['Picante', 'Ajo'] } })
    const res = await put(updateCategory, pizzasId, { enableOptionIds: ['Picante'] })
    expect(res.status).toBe(200)
    expect((await freshCategory()).disabledOptionIds).toEqual(['Ajo'])
  })

  it('ítem: reactiva variante, grupo y opción de subcategoría', async () => {
    expect((await put(updateItem, `${pizzasId}/items`, { itemId: muzzaId, enableVariantNames: ['Chica'] })).status).toBe(200)
    expect((await put(updateItem, `${pizzasId}/items`, { itemId: muzzaId, enableGroupIds: ['Borde'] })).status).toBe(200)
    expect((await put(updateItem, `${pizzasId}/items`, { itemId: empanadaId, enableOptionIds: ['Chimichurri'] })).status).toBe(200)
    const cat = await freshCategory()
    expect(cat.items[0].disabledVariantNames).toEqual([])
    expect(cat.items[0].disabledGroupIds).toEqual([])
    expect(cat.subcategories[0].items[0].disabledOptionIds).toEqual(['Opción borrada'])
    // El resto del ítem queda igual.
    expect(cat.items[0].name).toBe('Muzza')
    expect(cat.items[0].price).toBe(100000)
  })

  it('no pisa ocultos agregados después de cargar la vista', async () => {
    // Otra pestaña oculta «Ajo» después de que la vista cargó la lista.
    await Menu.updateOne({ locationId: loc._id }, { $set: { 'categories.0.disabledOptionIds': ['Picante', 'Ajo'] } })
    await put(updateCategory, pizzasId, { enableOptionIds: ['Picante'] })
    expect((await freshCategory()).disabledOptionIds).toEqual(['Ajo'])
  })

  it('rechaza listas inválidas', async () => {
    expect((await put(updateCategory, pizzasId, { enableOptionIds: 'Picante' })).status).toBe(400)
    expect((await put(updateItem, `${pizzasId}/items`, { itemId: muzzaId, enableGroupIds: [{ $ne: 1 }] })).status).toBe(400)
    expect((await freshCategory()).disabledOptionIds).toEqual(['Picante'])
  })

  it('un cajero no puede reactivar', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'c1', role: 'cashier', tenantId: tenant._id.toString(), assignedLocations: [] },
      expires: '',
    } as any)
    expect((await put(updateCategory, pizzasId, { enableOptionIds: ['Picante'] })).status).toBeGreaterThanOrEqual(401)
    expect((await freshCategory()).disabledOptionIds).toEqual(['Picante'])
  })
})
