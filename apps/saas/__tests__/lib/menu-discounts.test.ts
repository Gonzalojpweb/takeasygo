import { describe, expect, it } from 'vitest'
import {
  applyMenuDiscounts, applyPercent, blocksOtherDiscounts, cartMenuDiscountFor, dropExpiredMenuDiscounts,
  repriceLineForMode, resolveMenuDiscount, sanitizeDiscountTargets,
} from '@/lib/menu-discounts'

const CAT = 'a'.repeat(24)
const SUB = 'b'.repeat(24)
const ITEM = 'c'.repeat(24)

const arepaPromo = {
  _id: 'p1', type: 'discount', title: 'Día de la arepa', channels: [],
  discountTargets: [
    { kind: 'category' as const, categoryId: CAT, percent: 30 },
    { kind: 'variant' as const, itemId: ITEM, variantName: '1 sabor', percent: 40 },
  ],
}

describe('menu-discounts', () => {
  it('lo más específico manda dentro de la promo', () => {
    const ref = { categoryId: CAT, subcategoryId: SUB, itemId: ITEM }
    expect(resolveMenuDiscount([arepaPromo], { ...ref, variantName: '1 sabor' })?.percent).toBe(40)
    expect(resolveMenuDiscount([arepaPromo], { ...ref, variantName: '3 sabores' })?.percent).toBe(30)
  })

  it('entre promos gana el mayor %', () => {
    const other = { _id: 'p2', type: 'discount', title: 'x', discountTargets: [{ kind: 'item' as const, itemId: ITEM, percent: 50 }] }
    expect(resolveMenuDiscount([arepaPromo, other], { categoryId: CAT, itemId: ITEM, variantName: '1 sabor' })?.promotionId).toBe('p2')
  })

  it('redondea a pesos enteros', () => {
    expect(applyPercent(1_000_000, 30)).toBe(700_000)
    expect(applyPercent(333_300, 30)).toBe(233_300)
  })

  it('anota variantes de una subcategoría y arma la línea del carrito', () => {
    const menu = { categories: [{ _id: CAT, items: [], subcategories: [{ _id: SUB, items: [{ _id: ITEM, price: 0, variants: [
      { name: '1 sabor', price: 500_000 }, { name: '3 sabores', price: 900_000, takeawayPrice: 1_000_000 },
    ] }] }] }] }
    const out = applyMenuDiscounts(menu, [arepaPromo], 'takeaway') as any
    const [v1, v3] = out.categories[0].subcategories[0].items[0].variants
    expect(v1.price).toBe(300_000)
    expect(v3.takeawayPrice).toBe(700_000)
    const line = cartMenuDiscountFor(v3, 'takeaway')!
    expect(line).toMatchObject({ listBasePrice: 1_000_000, discountedBasePrice: 700_000, percent: 30 })
  })

  it('canal: vuelve a lista fuera del canal y no bloquea otros descuentos', () => {
    const d = { promotionId: 'p1', title: 't', percent: 30, stackable: false, channels: ['takeaway' as const], listBasePrice: 1000, discountedBasePrice: 700 }
    const line = { type: 'menuItem', basePrice: 700, extraPrice: 100, price: 800, menuDiscount: d }
    const del = repriceLineForMode(line, 'delivery')
    expect(del.price).toBe(1100)
    expect(blocksOtherDiscounts(del)).toBe(false)
    expect(blocksOtherDiscounts(repriceLineForMode(del, 'takeaway'))).toBe(true)
  })

  it('descuento vencido: el carrito vuelve a lista', () => {
    const d = { promotionId: 'p1', title: 't', percent: 30, stackable: false, channels: [], listBasePrice: 1000, discountedBasePrice: 700 }
    const lines = [{ type: 'menuItem', basePrice: 700, extraPrice: 0, price: 700, menuDiscount: d }]
    expect(dropExpiredMenuDiscounts(lines, [arepaPromo])).toBe(lines)
    expect(dropExpiredMenuDiscounts(lines, [])[0]).toMatchObject({ basePrice: 1000, price: 1000 })
  })

  it('valida lo que manda el panel', () => {
    expect(sanitizeDiscountTargets([]).ok).toBe(false)
    expect(sanitizeDiscountTargets([{ kind: 'category', categoryId: CAT, percent: 99 }]).ok).toBe(false)
    expect(sanitizeDiscountTargets([{ kind: 'variant', itemId: ITEM, variantName: '1 sabor', percent: 40 }]).ok).toBe(true)
  })
})
