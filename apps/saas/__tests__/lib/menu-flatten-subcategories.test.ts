import { describe, it, expect } from 'vitest'
import { flattenMenu, flattenMenuSnapshot, type RawMenu } from '@takeasygo/business'

/**
 * D13 — subcategorías en el snapshot del POS.
 *
 * Antes `flattenMenu` ignoraba `categories[].subcategories[]`: un ítem dentro
 * de una subcategoría no llegaba al POS ni al catálogo de precios del server
 * (que usa el mismo aplanado), así que tampoco se podía cobrar.
 */

const TENANT = '64b000000000000000000001'

function menu(overrides: Partial<RawMenu> = {}): RawMenu {
  return {
    tenantId: TENANT,
    categories: [
      {
        _id: 'cat-pizzas',
        name: 'Pizzas',
        sortOrder: 1,
        customizationGroups: [{ name: 'Tamaño', type: 'single', options: [{ name: 'Grande', extraPrice: 500 }] }],
        items: [{ _id: 'p-muzza', name: 'Muzzarella', price: 9000 }],
        subcategories: [
          {
            _id: 'sub-especiales',
            name: 'Especiales',
            sortOrder: 2,
            customizationGroups: [{ name: 'Borde', type: 'single', options: [{ name: 'Relleno', extraPrice: 800 }] }],
            items: [{ _id: 'p-fugazzeta', name: 'Fugazzeta rellena', price: 12000 }],
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe('flattenMenu — subcategorías', () => {
  it('el ítem de la subcategoría llega con category = padre y subcategoryId', () => {
    const { products, categories } = flattenMenu(menu())
    const fuga = products.find((p) => p.id === 'p-fugazzeta')
    expect(fuga).toBeDefined()
    expect(fuga!.category).toBe('Pizzas')
    expect(fuga!.subcategoryId).toBe('sub-especiales')

    const sub = categories.find((c) => c.id === 'sub-especiales')
    expect(sub).toMatchObject({ name: 'Especiales', parentId: 'cat-pizzas' })
    expect(categories.find((c) => c.id === 'cat-pizzas')!.parentId).toBeUndefined()
  })

  it('hereda los grupos de la categoría Y de la subcategoría', () => {
    const { products } = flattenMenu(menu())
    const names = products.find((p) => p.id === 'p-fugazzeta')!.modifiers!.map((m) => m.name)
    expect(names).toEqual(['Tamaño', 'Borde'])
  })

  it('los ítems directos de la categoría no cambian', () => {
    const { products } = flattenMenu(menu())
    const muzza = products.find((p) => p.id === 'p-muzza')!
    expect(muzza.subcategoryId).toBeUndefined()
    expect(muzza.modifiers!.map((m) => m.name)).toEqual(['Tamaño'])
  })

  it('mitad y mitad no mezcla sabores de distintas subcategorías', () => {
    const { products } = flattenMenu(
      menu({
        categories: [
          {
            _id: 'c',
            name: 'Pizzas',
            items: [
              { _id: 'a', name: 'A', price: 100, halfPrice: 50 },
              { _id: 'b', name: 'B', price: 100, halfPrice: 50 },
            ],
            subcategories: [
              { _id: 's', name: 'Esp', items: [{ _id: 'x', name: 'X', price: 100, halfPrice: 60 }] },
            ],
          },
        ],
      })
    )
    const a = products.find((p) => p.id === 'a')!
    const flavors = a.modifiers!.find((m) => m.name === '__half_first')!.options.map((o) => o.name)
    expect(flavors).toEqual(['A', 'B'])
    // X está solo en su subcategoría: no recibe mitad y mitad.
    expect(products.find((p) => p.id === 'x')!.modifiers).toBeUndefined()
  })
})

describe('flattenMenuSnapshot — dedup con jerarquía', () => {
  it('reapunta parentId al padre que sobrevivió y deduplica subcategorías por (padre, nombre)', () => {
    const second: RawMenu = {
      tenantId: TENANT,
      categories: [
        {
          _id: 'cat-pizzas-2',
          name: 'Pizzas',
          items: [],
          subcategories: [
            { _id: 'sub-especiales-2', name: 'Especiales', items: [{ _id: 'p-calabresa', name: 'Calabresa', price: 11000 }] },
          ],
        },
      ],
    }
    const { categories, products } = flattenMenuSnapshot([menu(), second])

    expect(categories.filter((c) => c.name === 'Pizzas')).toHaveLength(1)
    const subs = categories.filter((c) => c.name === 'Especiales')
    expect(subs).toHaveLength(1)
    expect(subs[0].parentId).toBe('cat-pizzas')
    expect(products.find((p) => p.id === 'p-calabresa')!.subcategoryId).toBe('sub-especiales')
  })
})
