// ============================================================================
// menu-category-layout.test.ts — Formato por categoría y secciones ancladas
// ============================================================================
// PUT /api/[tenant]/menu/categories/[categoryId] guarda cómo se muestra la
// categoría (lista, grilla o carrusel; en qué menú) y si los combos o la
// Tarjeta del Club van después de ella. Cada ancla es única por menú.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/translate', () => ({
  translateToEnglish: vi.fn().mockResolvedValue(''),
}))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import { PUT as updateCategory } from '@/app/api/[tenant]/menu/categories/[categoryId]/route'
import { PUT as updateSubcategory } from '@/app/api/[tenant]/menu/categories/[categoryId]/subcategories/route'
import { auth } from '@/lib/auth'

const SLUG = 'layout-test'
let tenant: any
let loc: any
let entradasId: string
let principalesId: string
let pastasId: string

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({ slug: SLUG, name: 'Layout', isActive: true, status: 'active', plan: 'try' })
  loc = await Location.create({ tenantId: tenant._id, slug: 'a', name: 'Sede A', address: 'A', isActive: true })
  const menu = await Menu.create({
    tenantId: tenant._id,
    locationId: loc._id,
    categories: [
      { name: 'Entradas', sortOrder: 0, items: [] },
      { name: 'Principales', sortOrder: 1, items: [], subcategories: [{ name: 'Pastas', sortOrder: 0, items: [] }] },
    ],
  })
  entradasId = String(menu.categories[0]._id)
  principalesId = String(menu.categories[1]._id)
  pastasId = String(menu.categories[1].subcategories![0]._id)
  vi.mocked(auth).mockResolvedValue({
    user: { id: 'a1', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [] },
    expires: '',
  } as any)
})

const put = (categoryId: string, body: Record<string, unknown>) =>
  updateCategory(
    new NextRequest(`http://localhost/api/${SLUG}/menu/categories/${categoryId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locationId: loc._id.toString(), ...body }),
    }),
    { params: Promise.resolve({ tenant: SLUG, categoryId }) },
  )

const categories = async () => ((await Menu.findOne({ locationId: loc._id }).lean()) as any).categories

describe('formato por categoría', () => {
  it('por defecto la categoría hereda el layout general en ambos menús', async () => {
    const [entradas] = await categories()
    expect(entradas.displayLayout).toBe('inherit')
    expect(entradas.displayLayoutApplyTo).toBe('both')
  })

  it('guarda carrusel solo para takeaway (disponible en todos los planes)', async () => {
    const res = await put(entradasId, { displayLayout: 'carousel', displayLayoutApplyTo: 'takeaway' })
    expect(res.status).toBe(200)
    const [entradas] = await categories()
    expect(entradas.displayLayout).toBe('carousel')
    expect(entradas.displayLayoutApplyTo).toBe('takeaway')
  })

  it('rechaza formatos y menús desconocidos sin tocar la categoría', async () => {
    expect((await put(entradasId, { displayLayout: 'mosaico' })).status).toBe(400)
    expect((await put(entradasId, { displayLayoutApplyTo: 'delivery' })).status).toBe(400)
    expect((await put(entradasId, { combosAfter: 'si' })).status).toBe(400)
    const [entradas] = await categories()
    expect(entradas.displayLayout).toBe('inherit')
  })
})

describe('secciones ancladas a una categoría', () => {
  it('combos y club se anclan a una sola categoría por menú', async () => {
    await put(entradasId, { combosAfter: true, clubCardAfter: true })
    let [entradas, principales] = await categories()
    expect(entradas.combosAfter).toBe(true)
    expect(entradas.clubCardAfter).toBe(true)

    await put(principalesId, { combosAfter: true })
    ;[entradas, principales] = await categories()
    expect(entradas.combosAfter).toBe(false)
    expect(principales.combosAfter).toBe(true)
    // El club no se movió: cada ancla es independiente.
    expect(entradas.clubCardAfter).toBe(true)
    expect(principales.clubCardAfter).toBe(false)
  })

  it('desactivar el ancla no afecta a las otras categorías', async () => {
    await put(principalesId, { combosAfter: true })
    await put(entradasId, { combosAfter: false })
    const [entradas, principales] = await categories()
    expect(entradas.combosAfter).toBe(false)
    expect(principales.combosAfter).toBe(true)
  })
})

const putSub = (body: Record<string, unknown>) =>
  updateSubcategory(
    new NextRequest(`http://localhost/api/${SLUG}/menu/categories/${principalesId}/subcategories`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locationId: loc._id.toString(), subcategoryId: pastasId, ...body }),
    }),
    { params: Promise.resolve({ tenant: SLUG, categoryId: principalesId }) },
  )

describe('formato por subcategoría', () => {
  it('por defecto hereda el formato de su categoría', async () => {
    const [, principales] = await categories()
    expect(principales.subcategories[0].displayLayout).toBe('inherit')
  })

  it('guarda su propio formato y menú de aplicación', async () => {
    const res = await putSub({ displayLayout: 'carousel', displayLayoutApplyTo: 'dine-in' })
    expect(res.status).toBe(200)
    const [, principales] = await categories()
    expect(principales.subcategories[0].displayLayout).toBe('carousel')
    expect(principales.subcategories[0].displayLayoutApplyTo).toBe('dine-in')
    // La categoría no cambia.
    expect(principales.displayLayout).toBe('inherit')
  })

  it('rechaza valores desconocidos', async () => {
    expect((await putSub({ displayLayout: 'mosaico' })).status).toBe(400)
    expect((await putSub({ displayLayoutApplyTo: 'delivery' })).status).toBe(400)
  })
})
