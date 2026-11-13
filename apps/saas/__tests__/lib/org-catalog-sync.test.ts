// ============================================================================
// org-catalog-sync.test.ts — carta central del grupo (F3): lógica pura
// ============================================================================
// planPush (envío a una carta), catalogFromMenu y linkSourceItems.
// ============================================================================

import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { catalogFromMenu, deepClone, linkSourceItems, mergeGroups, planPush, summarizePlan, type CatalogLike, type PushOptions } from '@/lib/organizations/catalog-sync'

const CAT_ID = 'catalog-1'
const NOW = new Date('2026-11-13T15:00:00Z')
const id = () => new mongoose.Types.ObjectId()
const opts = (over: Partial<PushOptions> = {}): PushOptions => ({ catalogId: CAT_ID, fields: ['info', 'prices', 'options'], linkByName: true, overrideLocalPrices: false, now: NOW, ...over })

function catalog(over: Partial<CatalogLike['items'][number]> = {}, extra: CatalogLike['items'] = []): CatalogLike {
  return {
    categories: [{ key: 'c-burgers', name: 'Hamburguesas', sortOrder: 0 }, { key: 'c-postres', name: 'Postres', sortOrder: 1 }],
    items: [
      {
        key: 'i-clasica', categoryKey: 'c-burgers', name: 'Clásica', description: 'Carne, queso y pan de papa', imageUrl: 'https://img/clasica.jpg',
        price: 1_000_000, takeawayPrice: 950_000, variants: [], tags: ['carne'], ivaRate: null, customizationGroups: [], isArchived: false, ...over,
      },
      ...extra,
    ],
  }
}

/** Carta de una sede con un plato vinculado a «Clásica» y datos locales. */
function linkedMenu() {
  const itemId = id()
  const categories = [{
    _id: id(), name: 'Burgers', sortOrder: 0, masterCategoryKey: 'c-burgers', items: [{
      _id: itemId, name: 'Clásica', description: 'Vieja descripción', imageUrl: '', price: 1_000_000, takeawayPrice: 950_000, tags: ['carne'],
      isAvailable: false, pausedReason: 'stock', pausedAt: new Date('2026-11-12T10:00:00Z'), stockPortions: 0, isFeatured: true, suggestWith: ['x'],
      businessPrice: 800_000, halfPrice: 500_000, likesCount: 42, disabledOptionIds: ['abc'], availabilityMode: 'scheduled',
      availabilitySchedule: [{ days: [1], timeStart: '12:00', timeEnd: '15:00' }], nameTranslations: { en: 'Classic' },
      hiddenReward: { enabled: true, discountPercentage: 10 }, variants: [], customizationGroups: [],
      master: { catalogId: CAT_ID, itemKey: 'i-clasica', syncedAt: new Date('2026-11-01'), syncedPrice: 1_000_000, syncedTakeawayPrice: 950_000, syncedVariantPrices: {} },
    }],
  }]
  return { categories, itemId }
}

describe('planPush — crear', () => {
  it('crea en la categoría del mismo nombre (y la vincula); el plato nuevo queda vinculado con sus precios', () => {
    const menu = [{ _id: id(), name: 'HAMBURGUESAS ', sortOrder: 0, items: [] }]
    const plan = planPush(menu, catalog(), ['i-clasica'], opts())
    expect(plan.items[0]).toMatchObject({ action: 'created', categoryName: 'HAMBURGUESAS ', price: { before: null, after: 1_000_000 } })
    expect(plan.categoriesCreated).toEqual([])
    const cat = plan.categories[0]
    expect(cat.masterCategoryKey).toBe('c-burgers')
    expect(cat.items[0]).toMatchObject({
      name: 'Clásica', price: 1_000_000, takeawayPrice: 950_000, isAvailable: true,
      master: { catalogId: CAT_ID, itemKey: 'i-clasica', syncedPrice: 1_000_000, syncedTakeawayPrice: 950_000 },
    })
    expect(plan.changed).toBe(true)
  })

  it('sin categoría parecida, crea una al final; si la categoría solo tiene subcategorías, va a la primera', () => {
    const plan = planPush([{ _id: id(), name: 'Bebidas', sortOrder: 3, items: [] }], catalog(), ['i-clasica'], opts())
    expect(plan.categoriesCreated).toEqual(['Hamburguesas'])
    expect(plan.categories[1]).toMatchObject({ name: 'Hamburguesas', sortOrder: 4, masterCategoryKey: 'c-burgers' })

    const subId = id()
    const withSubs = planPush([{ _id: id(), name: 'Hamburguesas', items: [], subcategories: [{ _id: subId, name: 'De carne', items: [] }] }], catalog(), ['i-clasica'], opts())
    expect(withSubs.categories[0].items).toHaveLength(0)
    expect(withSubs.categories[0].subcategories[0].items[0].name).toBe('Clásica')
  })

  it('un plato archivado o no elegido no se envía', () => {
    const cat = catalog({}, [{ key: 'i-flan', categoryKey: 'c-postres', name: 'Flan', description: '', imageUrl: '', price: 300_000, takeawayPrice: null, variants: [], tags: [], ivaRate: null, customizationGroups: [], isArchived: true }])
    const plan = planPush([], cat, ['i-flan'], opts())
    expect(plan.items).toEqual([])
    expect(plan.changed).toBe(false)
    expect(planPush([], cat, ['otro'], opts()).changed).toBe(false)
  })

  it('no modifica la carta que recibe', () => {
    const { categories } = linkedMenu()
    const snapshot = JSON.stringify(categories)
    planPush(categories, catalog({ name: 'Clásica XL', price: 1_200_000 }), ['i-clasica'], opts())
    expect(JSON.stringify(categories)).toBe(snapshot)
  })
})

describe('planPush — actualizar un plato vinculado', () => {
  it('mismo _id, cambia lo elegido y NO toca los datos locales de la sede', () => {
    const { categories, itemId } = linkedMenu()
    const plan = planPush(categories, catalog({ price: 1_100_000 }), ['i-clasica'], opts())
    const item = plan.categories[0].items[0]
    expect(String(item._id)).toBe(String(itemId))
    expect(plan.items[0]).toMatchObject({ action: 'updated', localPriceKept: false })
    expect(plan.items[0].changes).toEqual(['descripción', 'foto', 'precio'])
    expect(item).toMatchObject({ description: 'Carne, queso y pan de papa', imageUrl: 'https://img/clasica.jpg', price: 1_100_000 })
    // Locales intactos:
    expect(item).toMatchObject({
      isAvailable: false, pausedReason: 'stock', stockPortions: 0, isFeatured: true, suggestWith: ['x'], businessPrice: 800_000, halfPrice: 500_000,
      likesCount: 42, disabledOptionIds: ['abc'], availabilityMode: 'scheduled', nameTranslations: { en: 'Classic' }, hiddenReward: { enabled: true, discountPercentage: 10 },
    })
    expect(item.pausedAt).toBeInstanceOf(Date)
    expect(item.master).toMatchObject({ syncedPrice: 1_100_000, syncedAt: NOW })
  })

  it('solo «información»: el precio no se toca aunque sea distinto', () => {
    const { categories } = linkedMenu()
    const plan = planPush(categories, catalog({ price: 1_500_000 }), ['i-clasica'], opts({ fields: ['info'] }))
    expect(plan.categories[0].items[0].price).toBe(1_000_000)
    expect(plan.items[0].changes).not.toContain('precio')
  })

  it('precio cambiado por la sede después del envío: se conserva y se avisa; con «pisar» se reemplaza', () => {
    const { categories } = linkedMenu()
    categories[0].items[0].price = 1_050_000 // la sede lo subió
    const kept = planPush(categories, catalog({ price: 1_100_000 }), ['i-clasica'], opts({ fields: ['prices'] }))
    expect(kept.items[0]).toMatchObject({ localPriceKept: true, action: 'unchanged' })
    expect(kept.categories[0].items[0].price).toBe(1_050_000)
    expect(kept.changed).toBe(false)

    const forced = planPush(categories, catalog({ price: 1_100_000 }), ['i-clasica'], opts({ fields: ['prices'], overrideLocalPrices: true }))
    expect(forced.items[0]).toMatchObject({ localPriceKept: false, action: 'updated' })
    expect(forced.categories[0].items[0]).toMatchObject({ price: 1_100_000, master: { syncedPrice: 1_100_000 } })
  })

  it('el precio local conservado sigue detectándose en el próximo envío (no se «olvida»)', () => {
    const { categories } = linkedMenu()
    categories[0].items[0].price = 1_050_000
    const first = planPush(categories, catalog({ price: 1_100_000, description: 'Nueva' }), ['i-clasica'], opts())
    expect(first.categories[0].items[0].master.syncedPrice).toBe(1_000_000)
    const second = planPush(first.categories, catalog({ price: 1_200_000, description: 'Nueva' }), ['i-clasica'], opts())
    expect(second.items[0].localPriceKept).toBe(true)
    expect(second.categories[0].items[0].price).toBe(1_050_000)
  })

  it('enviar dos veces lo mismo: la segunda vez no cambia nada', () => {
    const { categories } = linkedMenu()
    const first = planPush(categories, catalog({ price: 1_100_000 }), ['i-clasica'], opts())
    const second = planPush(first.categories, catalog({ price: 1_100_000 }), ['i-clasica'], opts({ now: new Date('2026-11-14') }))
    expect(second.changed).toBe(false)
    expect(second.items[0].action).toBe('unchanged')
    expect(second.categories[0].items[0].master.syncedAt).toEqual(NOW) // no se reescribe
  })
})

describe('planPush — vincular por nombre', () => {
  const unlinked = () => {
    const itemId = id()
    return { itemId, categories: [{ _id: id(), name: 'Burgers', items: [{ _id: itemId, name: 'CLÁSICA', price: 900_000, variants: [], customizationGroups: [] }] }] }
  }

  it('el plato de la sede con el mismo nombre se vincula (no se duplica) y adopta los precios', () => {
    const { categories, itemId } = unlinked()
    const plan = planPush(categories, catalog(), ['i-clasica'], opts())
    expect(plan.items[0].action).toBe('linked')
    expect(plan.categories[0].items).toHaveLength(1)
    const item = plan.categories[0].items[0]
    expect(String(item._id)).toBe(String(itemId))
    expect(item).toMatchObject({ name: 'Clásica', price: 1_000_000, master: { itemKey: 'i-clasica', syncedPrice: 1_000_000 } })
  })

  it('al vincular, la categoría de la sede queda asociada: los platos nuevos de esa categoría caen ahí', () => {
    const { categories } = unlinked()
    const cat = catalog({}, [{ key: 'i-bacon', categoryKey: 'c-burgers', name: 'Bacon', description: '', imageUrl: '', price: 1_200_000, takeawayPrice: null, variants: [], tags: [], ivaRate: null, customizationGroups: [], isArchived: false }])
    const plan = planPush(categories, cat, ['i-clasica', 'i-bacon'], opts())
    expect(plan.categoriesCreated).toEqual([])
    expect(plan.categories).toHaveLength(1)
    expect(plan.categories[0]).toMatchObject({ name: 'Burgers', masterCategoryKey: 'c-burgers' })
    expect(plan.categories[0].items.map((i: any) => i.name)).toEqual(['Clásica', 'Bacon'])
  })

  it('sin «vincular por nombre» se crea aparte', () => {
    const { categories } = unlinked()
    const plan = planPush(categories, catalog(), ['i-clasica'], opts({ linkByName: false }))
    expect(plan.items[0].action).toBe('created')
    expect(plan.categories.flatMap((c) => c.items)).toHaveLength(2)
  })

  it('un plato ya vinculado a otro plato central no se reutiliza por nombre', () => {
    const categories = [{ _id: id(), name: 'Burgers', items: [{ _id: id(), name: 'Clásica', price: 1, master: { catalogId: CAT_ID, itemKey: 'otro', syncedAt: NOW, syncedPrice: 1, syncedTakeawayPrice: null, syncedVariantPrices: {} } }] }]
    expect(planPush(categories, catalog(), ['i-clasica'], opts()).items[0].action).toBe('created')
  })
})

describe('planPush — variantes y opciones', () => {
  function menuWithVariants() {
    const simpleId = id(), dobleId = id(), groupId = id(), optId = id()
    const categories = [{
      _id: id(), name: 'Burgers', items: [{
        _id: id(), name: 'Clásica', price: 1_000_000, customizationGroups: [{ _id: groupId, name: 'Extras', type: 'multiple', required: false, options: [{ _id: optId, name: 'Queso', extraPrice: 100_000, subGroups: [] }] }],
        variants: [{ _id: simpleId, name: 'Simple', price: 1_000_000 }, { _id: dobleId, name: 'Doble', price: 1_300_000 }, { _id: id(), name: 'Vegana', price: 1_100_000 }],
        master: { catalogId: CAT_ID, itemKey: 'i-clasica', syncedAt: NOW, syncedPrice: 1_000_000, syncedTakeawayPrice: 950_000, syncedVariantPrices: { simple: 1_000_000, doble: 1_250_000 } },
      }],
    }]
    return { categories, simpleId, dobleId, groupId, optId }
  }
  const master = catalog({
    variants: [{ name: 'Simple', price: 1_050_000, takeawayPrice: null }, { name: 'Doble', price: 1_400_000, takeawayPrice: null }, { name: 'Triple', price: 1_700_000, takeawayPrice: null }],
    customizationGroups: [{ name: 'extras', type: 'multiple', options: [{ name: 'Queso', extraPrice: 120_000 }, { name: 'Panceta', extraPrice: 150_000 }] }],
  })

  it('las variantes conservan su _id por nombre; se agregan las nuevas y se quitan (y avisan) las que no están', () => {
    const { categories, simpleId, dobleId } = menuWithVariants()
    const plan = planPush(categories, master, ['i-clasica'], opts({ fields: ['options'] }))
    const vs = plan.categories[0].items[0].variants
    expect(vs.map((v: any) => v.name)).toEqual(['Simple', 'Doble', 'Triple'])
    expect(String(vs[0]._id)).toBe(String(simpleId))
    expect(String(vs[1]._id)).toBe(String(dobleId))
    expect(vs[2]).toMatchObject({ name: 'Triple', price: 1_700_000 })
    // Sin «precios», las existentes conservan su precio.
    expect(vs[0].price).toBe(1_000_000)
    expect(plan.items[0].removedVariants).toEqual(['Vegana'])
    expect(plan.items[0].changes).toEqual(expect.arrayContaining(['variantes', 'opciones']))
  })

  it('precio de variantes: la cambiada por la sede se conserva, el resto se actualiza', () => {
    const { categories } = menuWithVariants()
    // Doble: enviada a 1.250.000 y la sede la tiene a 1.300.000 → local.
    const plan = planPush(categories, master, ['i-clasica'], opts({ fields: ['prices', 'options'] }))
    const vs = plan.categories[0].items[0].variants
    expect(vs.find((v: any) => v.name === 'Simple').price).toBe(1_050_000)
    expect(vs.find((v: any) => v.name === 'Doble').price).toBe(1_300_000)
    expect(plan.items[0].localPriceKept).toBe(true)
    expect(plan.categories[0].items[0].master.syncedVariantPrices).toMatchObject({ simple: 1_050_000, doble: 1_250_000, triple: 1_700_000 })
  })

  it('grupos y opciones conservan su _id por nombre y toman los precios de la carta central', () => {
    const { categories, groupId, optId } = menuWithVariants()
    const plan = planPush(categories, master, ['i-clasica'], opts({ fields: ['options'] }))
    const g = plan.categories[0].items[0].customizationGroups[0]
    expect(String(g._id)).toBe(String(groupId))
    expect(g.name).toBe('extras')
    expect(String(g.options[0]._id)).toBe(String(optId))
    expect(g.options[0].extraPrice).toBe(120_000)
    expect(g.options[1]._id).toBeUndefined()
    expect(g.options[1]).toMatchObject({ name: 'Panceta', extraPrice: 150_000 })
  })

  it('mergeGroups recursivo (subgrupos de una opción)', () => {
    const subId = id()
    const current = [{ _id: id(), name: 'Punto', options: [{ _id: id(), name: 'Jugoso', subGroups: [{ _id: subId, name: 'Salsa', options: [] }] }] }]
    const out = mergeGroups([{ name: 'Punto', options: [{ name: 'Jugoso', subGroups: [{ name: 'salsa', options: [{ name: 'Chimichurri' }] }] }] }], current)
    expect(String(out[0].options[0].subGroups[0]._id)).toBe(String(subId))
    expect(out[0].options[0].subGroups[0].options[0]).toMatchObject({ name: 'Chimichurri', extraPrice: 0 })
  })
})

describe('armar la carta central desde una sede', () => {
  function sourceMenu() {
    return [
      { _id: id(), name: 'Postres', sortOrder: 2, items: [{ _id: id(), name: 'Flan', price: 300_000, variants: [] }] },
      {
        _id: id(), name: 'Hamburguesas', sortOrder: 1, items: [{ _id: id(), name: 'Clásica', price: 1_000_000, takeawayPrice: 950_000, tags: ['carne'], ivaRate: 10.5, variants: [{ _id: id(), name: 'Doble', price: 1_300_000 }], customizationGroups: [{ _id: id(), name: 'Extras', type: 'multiple', options: [{ _id: id(), name: 'Queso', extraPrice: 100_000 }] }] }],
        subcategories: [{ _id: id(), name: 'Especiales', items: [{ _id: id(), name: 'Bacon', price: 1_200_000 }, { _id: id(), name: 'clásica', price: 5 }] }],
      },
    ]
  }
  let n = 0
  const key = () => `k${++n}`

  it('aplana subcategorías, ordena, saltea repetidos y deja grupos sin _id', () => {
    n = 0
    const r = catalogFromMenu(sourceMenu(), { categories: [], items: [] }, key)
    expect(r.categories.map((c) => c.name)).toEqual(['Hamburguesas', 'Postres'])
    expect(r.items.map((i) => i.name)).toEqual(['Clásica', 'Bacon', 'Flan'])
    expect(r.skippedDuplicates).toEqual(['clásica'])
    const clasica = r.items[0]
    expect(clasica).toMatchObject({ price: 1_000_000, takeawayPrice: 950_000, ivaRate: 10.5, variants: [{ name: 'Doble', price: 1_300_000, takeawayPrice: null }] })
    expect(JSON.stringify(clasica.customizationGroups)).not.toContain('_id')
    expect(r.links).toHaveLength(3)
  })

  it('no importa lo que ya está en la carta central y reusa la categoría con el mismo nombre', () => {
    const existing: CatalogLike = { categories: [{ key: 'c1', name: 'hamburguesas', sortOrder: 0 }], items: [{ ...catalog().items[0], categoryKey: 'c1' }] }
    const r = catalogFromMenu(sourceMenu(), existing, key)
    expect(r.categories.map((c) => c.name)).toEqual(['Postres'])
    expect(r.items.map((i) => [i.name, i.categoryKey])).toEqual([['Bacon', 'c1'], ['Flan', r.categories[0].key]])
  })

  it('ida y vuelta: la sede de origen queda vinculada y un envío posterior no le cambia nada', () => {
    const menu = sourceMenu()
    const r = catalogFromMenu(menu, { categories: [], items: [] }, key)
    const linked = linkSourceItems(menu, r.links, CAT_ID, NOW)
    const clasica = linked[1].items[0]
    expect(clasica.master).toMatchObject({ catalogId: CAT_ID, syncedPrice: 1_000_000, syncedTakeawayPrice: 950_000, syncedVariantPrices: { doble: 1_300_000 } })
    const cat: CatalogLike = { categories: r.categories, items: r.items }
    const plan = planPush(linked, cat, r.items.map((i) => i.key), opts())
    expect(summarizePlan(plan)).toMatchObject({ created: 0, linked: 0, updated: 0 })
    expect(plan.changed).toBe(false)
  })
})

describe('deepClone', () => {
  it('conserva ObjectId y Date', () => {
    const oid = id()
    const d = new Date()
    const c = deepClone({ a: [{ _id: oid, at: d }] })
    expect(c.a[0]._id).toBe(oid)
    expect(c.a[0].at).toBeInstanceOf(Date)
    expect(c.a[0].at).not.toBe(d)
  })
})
