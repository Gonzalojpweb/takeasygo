import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import {
  applyDiscount,
  distributeCents,
  lineDiscountCents,
  parseDiscountInput,
  removeDiscount,
  withQuantityKeepingDiscount,
  type DiscountedItem,
} from '@/lib/pos-online/discounts'

/** Fase D (2026-10): descuentos del POS — modelo por línea, al centavo. */
function line(price: number, quantity: number): DiscountedItem {
  return {
    _id: new mongoose.Types.ObjectId(),
    menuItemId: null,
    itemType: 'menuItem',
    categoryName: '',
    name: 'Plato',
    description: '',
    shortDescription: '',
    basePrice: price,
    extraPrice: 0,
    price,
    quantity,
    subtotal: price * quantity,
    customizations: [],
    notes: null,
    course: null,
  }
}
const meta = { by: 'u1', approvedBy: null, at: new Date('2026-10-24T20:00:00Z') }

describe('distributeCents', () => {
  it('reparte al centavo y la suma es exacta', () => {
    const out = distributeCents([1000, 1000, 1000], 1000)
    expect(out.reduce((s, n) => s + n, 0)).toBe(1000)
    expect(out).toEqual([334, 333, 333])
  })
  it('nunca supera el importe de cada línea ni el total', () => {
    expect(distributeCents([500, 300], 10_000)).toEqual([500, 300])
  })
})

describe('lineDiscountCents', () => {
  it('porcentaje redondeado y monto acotado a la línea', () => {
    expect(lineDiscountCents(3333, 'percent', 10)).toBe(333)
    expect(lineDiscountCents(1000, 'amount', 5000)).toBe(1000)
    expect(lineDiscountCents(1000, 'percent', 100)).toBe(1000)
  })
})

describe('applyDiscount', () => {
  it('por ítem: solo esa línea baja su subtotal', () => {
    const items = [line(1000, 2), line(500, 1)]
    const { items: out, discountedCents } = applyDiscount(items, { kind: 'percent', value: 50, reason: 'courtesy', note: null }, { ...meta, lineId: String(items[0]._id) })
    expect(discountedCents).toBe(1000)
    expect(out.map((i) => i.subtotal)).toEqual([1000, 500])
    expect(out[0].posDiscount).toMatchObject({ scope: 'item', amountCents: 1000, reason: 'courtesy' })
    expect(out[1].posDiscount).toBeUndefined()
  })

  it('por cuenta con monto: se reparte proporcional y suma exacto', () => {
    const items = [line(3000, 1), line(1000, 1)]
    const { items: out, discountedCents } = applyDiscount(items, { kind: 'amount', value: 1000, reason: 'regular', note: null }, { ...meta, lineId: null })
    expect(discountedCents).toBe(1000)
    expect(out.map((i) => i.subtotal)).toEqual([2250, 750])
  })

  it('el descuento nuevo reemplaza al anterior y se puede quitar', () => {
    const items = [line(1000, 1)]
    const first = applyDiscount(items, { kind: 'percent', value: 10, reason: 'promotion', note: null }, { ...meta, lineId: null }).items
    const second = applyDiscount(first, { kind: 'percent', value: 20, reason: 'promotion', note: null }, { ...meta, lineId: null }).items
    expect(second[0].subtotal).toBe(800)
    expect(removeDiscount(second, null)[0]).toMatchObject({ subtotal: 1000, posDiscount: null })
  })
})

describe('withQuantityKeepingDiscount', () => {
  it('el % se recalcula con la cantidad nueva; el monto fijo se mantiene', () => {
    const [pct] = applyDiscount([line(1000, 4)], { kind: 'percent', value: 25, reason: 'courtesy', note: null }, { ...meta, lineId: null }).items
    expect(withQuantityKeepingDiscount(pct, 2).subtotal).toBe(1500)
    const [fixed] = applyDiscount([line(1000, 4)], { kind: 'amount', value: 500, reason: 'courtesy', note: null }, { ...meta, lineId: null }).items
    expect(withQuantityKeepingDiscount(fixed, 2).subtotal).toBe(1500)
  })
})

describe('parseDiscountInput', () => {
  it('valida tipo, rango y motivo; «Otro» exige nota', () => {
    expect(() => parseDiscountInput({ kind: 'percent', value: 101, reason: 'courtesy' })).toThrow()
    expect(() => parseDiscountInput({ kind: 'amount', value: 0, reason: 'courtesy' })).toThrow()
    expect(() => parseDiscountInput({ kind: 'amount', value: 100, reason: 'nope' })).toThrow()
    expect(() => parseDiscountInput({ kind: 'amount', value: 100, reason: 'other' })).toThrow()
    expect(parseDiscountInput({ kind: 'amount', value: 100, reason: 'other', note: ' cumple ' })).toMatchObject({ note: 'cumple' })
  })
})
