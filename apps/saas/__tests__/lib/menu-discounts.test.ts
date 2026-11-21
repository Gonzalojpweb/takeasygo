import { describe, expect, it } from 'vitest'
import { posPromoLineDiscount } from '@takeasygo/business'
import { withQuantityKeepingDiscount } from '@/lib/pos-online/discounts'
import {
  annotateMenuItem,
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

  it('dos promos por modalidad: al pasar a retirar aplica la otra, no la lista', () => {
    const all = { _id: 'pa', type: 'discount', title: 'Todos', channels: [], discountTargets: [{ kind: 'item' as const, itemId: ITEM, percent: 20 }] }
    const del = { _id: 'pd', type: 'discount', title: 'Delivery', channels: ['delivery'], discountTargets: [{ kind: 'item' as const, itemId: ITEM, percent: 40 }] }
    const item = annotateMenuItem({ _id: ITEM, price: 1_000_000 }, CAT, null, [all, del], 'takeaway') as any
    expect(item.price).toBe(600_000)
    const d = cartMenuDiscountFor(item, 'takeaway')!
    const line = { type: 'menuItem', basePrice: d.discountedBasePrice, extraPrice: 0, price: d.discountedBasePrice, menuDiscount: d }
    const tk = repriceLineForMode(line, 'takeaway')
    expect(tk.price).toBe(800_000)
    expect(tk.menuDiscount!.promotionId).toBe('pa')
    expect(repriceLineForMode(tk, 'delivery').price).toBe(600_000)
  })

  it('POS: descuento solo del plato/variante, por canal, sin mitad y mitad', () => {
    const rules = [{ ...arepaPromo, channels: ['dine-in'] }]
    const line = { productId: ITEM, categoryId: CAT, unitPrice: 500_000, quantity: 2, modifiers: [{ name: 'Variante: 1 sabor', price: 0 }, { name: 'Extras: Queso', price: 100_000 }] }
    const hit = posPromoLineDiscount(line, rules, 'dine-in')!
    expect(hit.percent).toBe(40)
    expect(hit.perUnitCents).toBe(200_000)
    expect(hit.amountCents).toBe(400_000)
    expect(posPromoLineDiscount(line, rules, 'takeaway')).toBeNull()
    expect(posPromoLineDiscount({ ...line, modifiers: [{ name: 'Primera mitad: A', price: 1 }] }, rules, 'dine-in')).toBeNull()
    const three = posPromoLineDiscount({ ...line, quantity: 1, modifiers: [{ name: 'Variante: 3 sabores', price: 400_000 }] }, rules, 'dine-in')!
    expect(three.perUnitCents).toBe(270_000)
  })

  it('POS: el descuento de promo acompaña a la cantidad', () => {
    const item: any = { basePrice: 500_000, extraPrice: 0, quantity: 1, subtotal: 300_000, posDiscount: { kind: 'amount', value: 200_000, amountCents: 200_000, scope: 'item', reason: 'promotion', by: 'promo:p1' } }
    const three = withQuantityKeepingDiscount(item, 3)
    expect(three.posDiscount!.amountCents).toBe(600_000)
    expect(three.subtotal).toBe(900_000)
  })
})
