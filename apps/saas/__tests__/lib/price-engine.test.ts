import { describe, it, expect } from 'vitest'
import { applyAdjustment, computePlan, itemKeyOf, roundCents, type PricePlan, type PriceTargets } from '@/lib/menu/price-engine'
import { applyToMenu } from '@/lib/menu/price-apply'
import { nextListPrice } from '@/lib/menu/list-price'

const $ = (p: number) => p * 100
const ALL: PriceTargets = { dineIn: true, takeaway: true, business: true, variants: true, options: true }

function menu(locationId = 'L1') {
  return {
    locationId,
    categories: [
      {
        _id: 'C1', name: 'Bebidas', subcategories: [{ _id: 'S1', name: 'Frías', items: [{ _id: 'I9', name: 'Limonada', price: $(4000), originalPrice: $(4000), tags: [] }] }],
        items: [
          { _id: 'I1', name: 'Coca-Cola', price: $(5000), originalPrice: $(5000), tags: ['Gaseosa'] },
          { _id: 'I2', name: 'Agua', price: $(3000), takeawayPrice: $(3500), originalPrice: $(3000), takeawayOriginalPrice: $(3500), tags: [] },
        ],
      },
      {
        _id: 'C2', name: 'Platos', subcategories: [],
        items: [
          { _id: 'I3', name: 'Chowfan', price: $(18000), originalPrice: $(18000), tags: [], customizationGroups: [{ _id: 'G1', name: 'Cantidad', options: [{ _id: 'O1', name: '1 Plato', extraPrice: 0 }, { _id: 'O2', name: '2 Platos', extraPrice: $(12000) }] }] },
          { _id: 'I4', name: 'Café', price: $(5000), tags: [], variants: [{ _id: 'V1', name: 'Grande', price: $(5000) }, { _id: 'V2', name: 'Chico', price: $(4000) }] },
          { _id: 'I5', name: 'Promo', price: $(9000), originalPrice: $(10000), tags: [] }, // con tachado visible
          { _id: 'I6', name: 'Gratis', price: $(1000), tags: [] },
        ],
      },
    ],
  }
}

const plan = (rules: PricePlan['rules'], extra: Partial<PricePlan> = {}): PricePlan => ({ rules, targets: ALL, ...extra })
const visible = (cs: ReturnType<typeof computePlan>['changes']) => cs.filter(c => !c.hidden).map(c => [c.itemName, c.label, c.before / 100, c.after / 100])

describe('redondeo y ajustes', () => {
  it('redondea al $100, $500, $1000 y con terminación 900 / 990', () => {
    expect(roundCents($(12347), '100')).toBe($(12300))
    expect(roundCents($(12347), '500')).toBe($(12500))
    expect(roundCents($(12347), '1000')).toBe($(12000))
    expect(roundCents($(12347), 'end900')).toBe($(11900))
    expect(roundCents($(12600), 'end900')).toBe($(12900))
    expect(roundCents($(12347), 'end990')).toBe($(11990))
    expect(roundCents($(12347.4), 'none')).toBe($(12347))
  })
  it('porcentaje, monto fijo y precio exacto (los 10 artículos de $10.000 → $12.000)', () => {
    expect(applyAdjustment($(10000), { kind: 'percent', value: 20, rounding: '100' })).toBe($(12000))
    expect(applyAdjustment($(10000), { kind: 'amount', value: 2000, rounding: 'none' })).toBe($(12000))
    expect(applyAdjustment($(10000), { kind: 'set', value: 12000, rounding: 'none' })).toBe($(12000))
    expect(applyAdjustment($(10000), { kind: 'percent', value: -10, rounding: '100' })).toBe($(9000))
  })
})

describe('computePlan', () => {
  it('una categoría entera +10 %, incluidas subcategorías; para llevar solo si tiene precio propio', () => {
    const r = computePlan([menu()], plan([{ id: 'r1', selection: { categories: ['bebidas'] }, adjustment: { kind: 'percent', value: 10, rounding: '100' } }]))
    expect(visible(r.changes)).toEqual([
      ['Coca-Cola', 'Precio', 5000, 5500],
      ['Agua', 'Precio', 3000, 3300],
      ['Agua', 'Para llevar', 3500, 3900],
      ['Limonada', 'Precio', 4000, 4400],
    ])
    expect(r.items).toBe(3)
    // La lista acompaña al precio (sin tachado falso).
    expect(r.changes.find(c => c.itemName === 'Coca-Cola' && c.field === 'originalPrice')?.after).toBe($(5500))
  })

  it('la última regla gana: toda la carta +10 % y la Coca-Cola a precio exacto', () => {
    const r = computePlan([menu()], plan([
      { id: 'todo', selection: { all: true }, adjustment: { kind: 'percent', value: 10, rounding: '100' } },
      { id: 'coca', selection: { items: [itemKeyOf('Bebidas', 'Coca-Cola')] }, adjustment: { kind: 'set', value: 6000, rounding: 'none' } },
    ]))
    const coca = r.changes.find(c => c.itemName === 'Coca-Cola' && c.field === 'price')!
    expect([coca.after / 100, coca.source]).toEqual([6000, 'coca'])
    expect(r.changes.find(c => c.itemName === 'Agua' && c.field === 'price')!.after).toBe($(3300))
  })

  it('extras con costo siguen al porcentaje (con terminación 900 se redondean al $100); variantes también', () => {
    const r = computePlan([menu()], plan([{ id: 'r', selection: { categories: ['Platos'] }, adjustment: { kind: 'percent', value: 10, rounding: 'end900' } }]))
    expect(visible(r.changes)).toEqual(expect.arrayContaining([
      ['Chowfan', 'Precio', 18000, 19900],
      ['Chowfan', 'Extra 2 Platos', 12000, 13200],
      ['Café', 'Variante Grande', 5000, 5900],
      ['Café', 'Variante Chico', 4000, 4900],
    ]))
    // La opción en $0 no se toca.
    expect(r.changes.some(c => c.optionId === 'O1')).toBe(false)
  })

  it('monto fijo no toca extras; precio exacto avisa en platos con variantes', () => {
    const amt = computePlan([menu()], plan([{ id: 'r', selection: { categories: ['Platos'] }, adjustment: { kind: 'amount', value: 500, rounding: 'none' } }]))
    expect(amt.changes.some(c => c.field === 'option.extraPrice')).toBe(false)
    const set = computePlan([menu()], plan([{ id: 'r', selection: { items: [itemKeyOf('Platos', 'Café')] }, adjustment: { kind: 'set', value: 6000, rounding: 'none' } }]))
    expect(set.warnings.map(w => w.message)).toEqual(['Tiene variantes: su precio exacto se ajusta a mano.'])
  })

  it('con descuento visible, la lista se ajusta en la misma proporción', () => {
    const r = computePlan([menu()], plan([{ id: 'r', selection: { items: [itemKeyOf('Platos', 'Promo')] }, adjustment: { kind: 'percent', value: 10, rounding: 'none' } }]))
    expect(r.changes.find(c => c.field === 'originalPrice')!.after).toBe($(11000))
  })

  it('filtros por etiqueta y rango de precio; bajar a $0 o menos es error', () => {
    const tag = computePlan([menu()], plan([{ id: 'r', selection: { all: true, tag: 'gaseosa' }, adjustment: { kind: 'percent', value: 10, rounding: '100' } }]))
    expect(visible(tag.changes).map(v => v[0])).toEqual(['Coca-Cola'])
    const range = computePlan([menu()], plan([{ id: 'r', selection: { all: true, minPrice: 9000 }, adjustment: { kind: 'percent', value: 10, rounding: '100' } }]))
    expect([...new Set(visible(range.changes).map(v => v[0]))]).toEqual(['Chowfan', 'Promo'])
    const zero = computePlan([menu()], plan([{ id: 'r', selection: { items: [itemKeyOf('Platos', 'Gratis')] }, adjustment: { kind: 'amount', value: -1000, rounding: 'none' } }]))
    expect(zero.changes).toEqual([])
    expect(zero.warnings[0].level).toBe('error')
  })

  it('ajuste a mano manda sobre las reglas y fija también el precio para llevar', () => {
    const r = computePlan([menu()], plan(
      [{ id: 'todo', selection: { all: true }, adjustment: { kind: 'percent', value: 10, rounding: '100' } }],
      { overrides: { [itemKeyOf('Bebidas', 'Agua')]: { price: $(3800) } } },
    ))
    expect(visible(r.changes).filter(v => v[0] === 'Agua')).toEqual([['Agua', 'Precio', 3000, 3800], ['Agua', 'Para llevar', 3500, 3800]])
  })

  it('varias sedes: la misma regla por nombre en cada carta', () => {
    const r = computePlan([menu('L1'), menu('L2')], plan([{ id: 'r', selection: { items: [itemKeyOf('Bebidas', 'Coca-Cola')] }, adjustment: { kind: 'set', value: 6000, rounding: 'none' } }]))
    expect(r.changes.filter(c => c.field === 'price').map(c => c.locationId)).toEqual(['L1', 'L2'])
    expect(r.items).toBe(1)
  })

  it('qué precios toca: solo para llevar', () => {
    const r = computePlan([menu()], { rules: [{ id: 'r', selection: { all: true }, adjustment: { kind: 'percent', value: 10, rounding: '100' } }], targets: { dineIn: false, takeaway: true, business: false, variants: false, options: false } })
    expect(visible(r.changes)).toEqual([['Agua', 'Para llevar', 3500, 3900]])
  })
})

describe('applyToMenu', () => {
  it('aplica y deshace exactamente; un conflicto no escribe nada', () => {
    const m = menu()
    const r = computePlan([m], plan([{ id: 'r', selection: { all: true }, adjustment: { kind: 'percent', value: 10, rounding: '100' } }]))
    expect(applyToMenu(m, r.changes)).toEqual([])
    expect(m.categories[0].items[0].price).toBe($(5500))
    expect(m.categories[1].items[0].customizationGroups![0].options[1].extraPrice).toBe($(13200))
    expect(applyToMenu(m, r.changes, 'back')).toEqual([])
    expect(m.categories[0].items[0].price).toBe($(5000))

    // Alguien cambió la Coca-Cola entre la vista previa y la aplicación.
    m.categories[0].items[0].price = $(5200)
    const conflicts = applyToMenu(m, r.changes)
    expect(conflicts.map(c => c.change.itemName)).toEqual(['Coca-Cola'])
    expect(m.categories[0].items[1].price).toBe($(3000)) // nada se escribió
  })
})

describe('nextListPrice (edición de un plato)', () => {
  it('sin descuento acompaña; con descuento lo respeta salvo que el precio lo alcance', () => {
    expect(nextListPrice($(5000), $(5000), $(5500))).toBe($(5500))
    expect(nextListPrice($(5000), undefined, $(5500))).toBe($(5500))
    expect(nextListPrice($(9000), $(10000), $(9500))).toBe($(10000))
    expect(nextListPrice($(9000), $(10000), $(10500))).toBe($(10500))
  })
})
