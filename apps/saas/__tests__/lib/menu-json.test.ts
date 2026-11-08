import { describe, it, expect } from 'vitest'
import { parseMenuJson, menuJsonToCategories } from '@/lib/provisioning/menu-json'
import { buildImportCategories, toCentsCategories, validateImportCategories } from '@/lib/menu/import-format'

const v1 = {
  version: 1,
  categories: [
    {
      name: 'Pizzas',
      description: 'Masa madre',
      items: [
        {
          name: 'Muzzarella', price: 12000, takeawayPrice: 11000, tags: ['vegetariano'],
          variants: [{ name: 'Grande', price: 12000 }, { name: 'Chica', price: 9000 }],
          customizationGroups: [{ name: 'Extra', type: 'multiple', options: [{ name: 'Jamón', extraPrice: 1500 }] }],
        },
      ],
      subcategories: [{ name: 'Especiales', items: [{ name: 'Fugazzeta', price: 15500 }] }],
    },
  ],
}

describe('parseMenuJson', () => {
  it('acepta el formato v1 y cuenta categorías, subcategorías y productos', () => {
    const r = parseMenuJson(JSON.stringify(v1))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.stats).toEqual({ categories: 1, subcategories: 1, items: 2 })
  })

  it('tolera bloques ```json y un array suelto de categorías', () => {
    expect(parseMenuJson('```json\n' + JSON.stringify(v1) + '\n```').ok).toBe(true)
    expect(parseMenuJson([{ name: 'Postres', items: [{ name: 'Flan', price: 500000 }] }]).ok).toBe(true)
  })

  it('explica qué está mal y dónde', () => {
    const bad = parseMenuJson({ version: 1, categories: [{ name: 'Pizzas', items: [{ name: 'Muzza' }] }] })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toMatch(/price/)
    const noJson = parseMenuJson('{ esto no es json')
    if (!noJson.ok) expect(noJson.error).toMatch(/JSON válido/)
    const empty = parseMenuJson({ version: 1, categories: [] })
    if (!empty.ok) expect(empty.error).toMatch(/no tiene categorías/)
  })

  it('con version 1 avisa si un precio parece estar en centavos', () => {
    const r = parseMenuJson({ version: 1, categories: [{ name: 'A', items: [{ name: 'B', price: 1_200_000_000 }] }] })
    expect(r.ok).toBe(false)
  })
})

describe('menuJsonToCategories (unidad de precio por versión)', () => {
  it('version 1: pesos → centavos en precio, variantes, takeaway y opciones', () => {
    const r = parseMenuJson(v1)
    if (!r.ok) throw new Error(r.error)
    const [cat] = menuJsonToCategories(r.menu) as Array<Record<string, any>>
    const item = cat.items[0]
    expect(item.price).toBe(1_200_000)
    expect(item.takeawayPrice).toBe(1_100_000)
    expect(item.variants.map((v: { price: number }) => v.price)).toEqual([1_200_000, 900_000])
    expect(item.customizationGroups[0].options[0].extraPrice).toBe(150_000)
    expect(item.tags).toEqual(['vegetariano'])
    expect(cat.subcategories[0].items[0].price).toBe(1_550_000)
  })

  it('sin version: los precios quedan tal cual (centavos, JSON viejos)', () => {
    const legacy = { categories: [{ name: 'Postres', items: [{ name: 'Flan', price: 450000 }] }] }
    const r = parseMenuJson(legacy)
    if (!r.ok) throw new Error(r.error)
    const [cat] = menuJsonToCategories(r.menu) as Array<Record<string, any>>
    expect(cat.items[0].price).toBe(450000)
  })

  it('el importador clásico usa el mismo armado y la misma regla', () => {
    expect(validateImportCategories(v1.categories)).toBe(true)
    const built = buildImportCategories(toCentsCategories(v1.categories as never, 1)) as Array<Record<string, any>>
    expect(built[0].items[0].price).toBe(1_200_000)
    expect(built[0].items[0].isAvailable).toBe(true)
    expect(validateImportCategories([{ name: 'X', items: [{ name: 'Y' }] }])).toBe(false)
  })
})
