import { describe, it, expect } from 'vitest'
import { STOREFRONT_TEMPLATES } from '@/lib/verticals'
import { catalogCategoryDefaultsToGrid, getStorefrontPreset, storefrontPresetFor } from '@/lib/storefront/templates'
import { blockedCatalogFields, isCatalogItem } from '@/lib/catalog/menu-guard'
import { projectCatalogToMenu } from '@/lib/catalog/projection'

describe('plantillas comerciales (etapa 2)', () => {
  it('un restaurante sin rubro conserva los textos de siempre', () => {
    const p = storefrontPresetFor({})
    expect(p.id).toBe('gastronomia')
    expect(p.orderTitle).toBe('Hacé tu pedido')
    expect(p.orderSubtitle).toEqual({ withDelivery: 'Take away y delivery', pickupOnly: 'Pedí y retirá sin esperar' })
    expect(p.browseTitle).toBe('Menú')
    expect(p.browseSubtitle).toBe('Platos, postres y bebidas')
    expect(p.showBrand).toBe(false)
  })

  it('tecnología: tienda en grilla con marca, «desde» y especificaciones', () => {
    const p = storefrontPresetFor({ vertical: 'tecnologia' })
    expect(p).toMatchObject({ id: 'tecnologia', orderTitle: 'Comprá online', browseTitle: 'Catálogo', catalogLayout: 'grid', showBrand: true, showSpecs: true, showFromPrice: true, fallbackIcon: 'product' })
  })

  it('la plantilla elegida manda sobre la del rubro', () => {
    expect(storefrontPresetFor({ vertical: 'tecnologia', storefrontTemplate: 'servicios' }).orderTitle).toBe('Contratá online')
  })

  it('hay un preset por cada plantilla registrada', () => {
    for (const t of STOREFRONT_TEMPLATES) expect(getStorefrontPreset(t.id).id).toBe(t.id)
  })

  it('solo las categorías del catálogo toman la grilla de la plantilla', () => {
    const retail = getStorefrontPreset('retail')
    expect(catalogCategoryDefaultsToGrid({ catalogCategory: true }, retail)).toBe(true)
    expect(catalogCategoryDefaultsToGrid({}, retail)).toBe(false) // categoría de la carta: sin cambios
    expect(catalogCategoryDefaultsToGrid({ catalogCategory: true }, getStorefrontPreset('gastronomia'))).toBe(false)
  })
})

describe('editor de la carta con productos del catálogo', () => {
  it('pausar, destacar o habilitar canales sí; contenido no', () => {
    expect(isCatalogItem({ catalogLink: { productId: 'p' } })).toBe(true)
    expect(isCatalogItem({ catalogLink: null })).toBe(false)
    expect(blockedCatalogFields({ locationId: 'l', itemId: 'i', isAvailable: false })).toEqual([])
    expect(blockedCatalogFields({ locationId: 'l', itemId: 'i', isFeatured: true, isTakeawayAvailable: true })).toEqual([])
    expect(blockedCatalogFields({ locationId: 'l', itemId: 'i', price: 100, name: 'X' })).toEqual(['price', 'name'])
    expect(blockedCatalogFields({ locationId: 'l', itemId: 'i', price: undefined })).toEqual([])
  })
})

describe('ficha del producto en la proyección', () => {
  it('lleva marca, modelo y especificaciones a la tienda', () => {
    const r = projectCatalogToMenu([], [{
      _id: 'p1', name: 'Cargador 20W', brand: 'Acme', model: 'C20', category: 'Cargadores',
      attributes: [{ name: 'Potencia', value: '20 W' }, { name: 'Conector', value: 'USB-C' }],
      variants: [{ _id: 'v1', code: 'C20', listPrice: 900000 }],
    }], 'loc-1')
    expect(r.categories[0].items[0].catalogLink).toMatchObject({
      brand: 'Acme', model: 'C20', specs: [{ name: 'Potencia', value: '20 W' }, { name: 'Conector', value: 'USB-C' }],
    })
  })
})
