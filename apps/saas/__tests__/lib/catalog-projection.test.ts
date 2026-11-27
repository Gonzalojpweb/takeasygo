import { describe, it, expect } from 'vitest'
import { projectCatalogToMenu, variantsForLocation, type ProjectionProduct } from '@/lib/catalog/projection'
import { catalogLineFields } from '@/lib/catalog/order-line'
import { parseCatalogProductInput, CatalogInputError } from '@/lib/catalog/validation'

const LOC_A = '64b0000000000000000000a1'
const LOC_B = '64b0000000000000000000b2'
const NOW = new Date('2026-11-26T12:00:00Z')

const dishCategory = {
  _id: 'cat-dish',
  name: 'Hamburguesas',
  sortOrder: 0,
  isAvailable: true,
  items: [{ _id: 'dish-1', name: 'Clásica', price: 900000, variants: [] }],
}

function funda(over: Partial<ProjectionProduct> = {}): ProjectionProduct {
  return {
    _id: 'prod-1',
    kind: 'product',
    name: 'Funda de silicona',
    category: 'Fundas',
    brand: 'Acme',
    status: 'active',
    variants: [
      { _id: 'var-negra', code: 'FUN-NEG', name: 'Negra · iPhone 15', listPrice: 1500000, offers: [] },
      { _id: 'var-roja', code: 'FUN-ROJ', options: [{ name: 'Color', value: 'Roja' }], listPrice: 1600000, offers: [] },
    ],
    ...over,
  }
}

describe('proyección del catálogo a la carta', () => {
  it('no toca los platos y agrega una categoría del catálogo', () => {
    const r = projectCatalogToMenu([dishCategory], [funda()], LOC_A, NOW)
    expect(r.categories[0]).toMatchObject({ name: 'Hamburguesas', items: [{ _id: 'dish-1', name: 'Clásica' }] })
    const cat = r.categories.find(c => c.name === 'Fundas')!
    expect(cat.catalogCategory).toBe(true)
    expect(cat.items).toHaveLength(1)
    const item = cat.items[0]
    expect(item.price).toBe(1500000) // el menor
    expect(item.variants.map((v: any) => [v.name, v.price, v.variantId])).toEqual([
      ['Negra · iPhone 15', 1500000, 'var-negra'],
      ['Roja', 1600000, 'var-roja'], // sin nombre: atributos
    ])
    expect(item.catalogLink).toMatchObject({ productId: 'prod-1', defaultVariantId: null, kind: 'product' })
    expect(r.projectedItems).toBe(1)
  })

  it('precio y disponibilidad por sede; sin oferta en la sede no se vende ahí', () => {
    const p = funda({
      variants: [
        { _id: 'v1', code: 'A', listPrice: 1000, offers: [{ locationId: LOC_A, price: 1200, available: true }, { locationId: LOC_B, price: null, available: false }] },
        { _id: 'v2', code: 'B', listPrice: 2000, offers: [{ locationId: LOC_B, price: null, available: true }] },
      ],
    })
    expect(variantsForLocation(p, LOC_A)).toEqual([{ id: 'v1', name: 'A', price: 1200, available: true, code: 'A', barcode: null }])
    expect(variantsForLocation(p, LOC_B)).toEqual([
      { id: 'v1', name: 'A', price: 1000, available: false, code: 'A', barcode: null },
      { id: 'v2', name: 'B', price: 2000, available: true, code: 'B', barcode: null },
    ])
    // En A queda una sola variante: sin selector, identificada por defaultVariantId.
    const a = projectCatalogToMenu([], [p], LOC_A, NOW).categories[0].items[0]
    expect(a.variants).toEqual([])
    expect(a.price).toBe(1200)
    expect(a.catalogLink.defaultVariantId).toBe('v1')
    // En B solo se muestra la disponible.
    const b = projectCatalogToMenu([], [p], LOC_B, NOW).categories[0].items[0]
    expect(b.catalogLink.defaultVariantId).toBe('v2')
    expect(b.isAvailable).toBe(true)
  })

  it('reproyectar conserva el _id del ítem y de cada variante, los likes y la pausa manual', () => {
    const first = projectCatalogToMenu([dishCategory], [funda()], LOC_A, NOW).categories
    const cat = first.find(c => c.name === 'Fundas')!
    cat._id = 'cat-fundas'
    cat.items[0]._id = 'item-funda'
    cat.items[0].likesCount = 7
    cat.items[0].pausedReason = 'manual'
    cat.items[0].isAvailable = false
    cat.items[0].variants[0]._id = 'mv-negra'

    const again = projectCatalogToMenu(first, [funda({ name: 'Funda premium' })], LOC_A, NOW).categories
    const item = again.find(c => c.name === 'Fundas')!.items[0]
    expect(item._id).toBe('item-funda')
    expect(item.name).toBe('Funda premium')
    expect(item.likesCount).toBe(7)
    expect(item.isAvailable).toBe(false)
    expect(item.pausedReason).toBe('manual')
    expect(item.variants[0]._id).toBe('mv-negra')
    expect(again.find(c => c.name === 'Fundas')!._id).toBe('cat-fundas')
  })

  it('archivado o sin variantes activas: se quita, y la categoría vacía del catálogo desaparece', () => {
    const first = projectCatalogToMenu([dishCategory], [funda()], LOC_A, NOW).categories
    const archived = projectCatalogToMenu(first, [funda({ status: 'archived' })], LOC_A, NOW)
    expect(archived.categories.map(c => c.name)).toEqual(['Hamburguesas'])
    const inactive = projectCatalogToMenu(first, [funda({ variants: [{ _id: 'x', code: 'X', listPrice: 1, isActive: false }] })], LOC_A, NOW)
    expect(inactive.categories.map(c => c.name)).toEqual(['Hamburguesas'])
  })

  it('una categoría de la carta con el mismo nombre no se mezcla con el catálogo', () => {
    const sameName = { _id: 'c2', name: 'Fundas', items: [{ _id: 'd2', name: 'Plato raro', price: 1 }] }
    const r = projectCatalogToMenu([sameName], [funda()], LOC_A, NOW)
    expect(r.categories).toHaveLength(2)
    expect(r.categories[0].items).toEqual([{ _id: 'd2', name: 'Plato raro', price: 1 }])
  })

  it('servicio sin categoría va a «Servicios»', () => {
    const s = funda({ kind: 'service', category: '', variants: [{ _id: 's1', code: 'S1', listPrice: 500, offers: [] }] })
    const r = projectCatalogToMenu([], [s], LOC_A, NOW)
    expect(r.categories[0].name).toBe('Servicios')
    expect(r.categories[0].items[0].catalogLink.kind).toBe('service')
  })
})

describe('línea de pedido del catálogo', () => {
  it('plato: no agrega campos', () => {
    expect(catalogLineFields({ catalogLink: null }, null)).toEqual({})
    expect(catalogLineFields(undefined, { variantId: 'x' })).toEqual({})
  })
  it('producto con variante elegida o con variante única', () => {
    expect(catalogLineFields({ catalogLink: { productId: 'p', defaultVariantId: null } }, { variantId: 'v9' }))
      .toEqual({ catalogProductId: 'p', catalogVariantId: 'v9', itemKind: 'product' })
    expect(catalogLineFields({ catalogLink: { productId: 'p', defaultVariantId: 'v1', kind: 'service' } }, null))
      .toEqual({ catalogProductId: 'p', catalogVariantId: 'v1', itemKind: 'service' })
  })
})

describe('validación del producto', () => {
  const locs = new Set([LOC_A])
  const base = { name: 'Cargador', variants: [{ code: ' car 20w ', listPrice: 1000 }] }

  it('normaliza el código y deja precio de lista en centavos', () => {
    const p = parseCatalogProductInput(base, locs)
    expect(p.variants[0].code).toBe('CAR20W')
    expect(p.kind).toBe('product')
  })
  it('rechaza códigos o códigos de barras repetidos y sedes ajenas', () => {
    expect(() => parseCatalogProductInput({ ...base, variants: [{ code: 'A', listPrice: 1 }, { code: 'a', listPrice: 1 }] }, locs)).toThrow(CatalogInputError)
    expect(() => parseCatalogProductInput({ ...base, variants: [{ code: 'A', barcode: '779', listPrice: 1 }, { code: 'B', barcode: '779', listPrice: 1 }] }, locs)).toThrow(/barras/)
    expect(() => parseCatalogProductInput({ ...base, variants: [{ code: 'A', listPrice: 1, offers: [{ locationId: LOC_B }] }] }, locs)).toThrow(/sedes/)
  })
  it('rechaza precio con decimales (centavos), sin variantes o imagen no https', () => {
    expect(() => parseCatalogProductInput({ ...base, variants: [{ code: 'A', listPrice: 10.5 }] }, locs)).toThrow(CatalogInputError)
    expect(() => parseCatalogProductInput({ name: 'X', variants: [] }, locs)).toThrow(CatalogInputError)
    expect(() => parseCatalogProductInput({ ...base, imageUrl: 'http://x' }, locs)).toThrow(/https/)
  })
})

describe('POS: carta aplanada y variante de la venta', () => {
  it('el producto del catálogo llega al POS con sus variantes, códigos y códigos de barras', async () => {
    const { flattenMenu } = await import('@takeasygo/business')
    const projected = projectCatalogToMenu([], [funda({ variants: [
      { _id: 'var-negra', code: 'FUN-NEG', barcode: '7790000000011', name: 'Negra', listPrice: 1500000, offers: [] },
      { _id: 'var-roja', code: 'FUN-ROJ', name: 'Roja', listPrice: 1600000, offers: [] },
    ] })], LOC_A, NOW)
    const item = projected.categories[0].items[0]
    item._id = 'item-1'
    const { products } = flattenMenu({ tenantId: 't1', categories: projected.categories as never })
    const p = products[0]
    expect(p.catalog).toEqual({
      productId: 'prod-1', kind: 'product', defaultVariantId: null,
      variants: [
        { variantId: 'var-negra', name: 'Negra', code: 'FUN-NEG', barcode: '7790000000011' },
        { variantId: 'var-roja', name: 'Roja', code: 'FUN-ROJ', barcode: null },
      ],
    })
    expect(p.modifiers?.[0]?.name).toBe('Variante')
  })

  it('withCatalogLines toma la variante de la opción «Variante: …» o la única; los platos no cambian', async () => {
    const { withCatalogLines } = await import('@/lib/pos-online/catalogLines')
    const catalogMulti = { productId: 'p1', kind: 'product' as const, defaultVariantId: null, variants: [{ variantId: 'v1', name: 'Negra', code: 'A', barcode: null }, { variantId: 'v2', name: 'Roja', code: 'B', barcode: null }] }
    const catalogSingle = { productId: 'p2', kind: 'service' as const, defaultVariantId: 'v9', variants: [{ variantId: 'v9', name: '', code: 'S', barcode: null }] }
    const products = new Map<string, any>([['m1', { catalog: catalogMulti }], ['m2', { catalog: catalogSingle }], ['m3', {}]])
    const lines: any[] = [
      { menuItemId: 'm1', customizations: [{ selectedOptions: [{ name: 'Variante: Roja' }] }] },
      { menuItemId: 'm2', customizations: [] },
      { menuItemId: 'm3', customizations: [{ selectedOptions: [{ name: 'Variante: Roja' }] }] },
      { menuItemId: 'm1', customizations: [] },
    ]
    expect(withCatalogLines(lines, products)).toBe(2)
    expect(lines[0]).toMatchObject({ catalogProductId: 'p1', catalogVariantId: 'v2', itemKind: 'product' })
    expect(lines[1]).toMatchObject({ catalogProductId: 'p2', catalogVariantId: 'v9', itemKind: 'service' })
    expect(lines[2].catalogProductId).toBeUndefined() // plato: sin cambios
    expect(lines[3]).toMatchObject({ catalogProductId: 'p1' })
    expect(lines[3].catalogVariantId).toBeUndefined() // sin variante elegida: no se inventa
  })
})
