import { describe, it, expect } from 'vitest'
import { flattenMenuSnapshot, VARIANT_GROUP_NAME, type RawMenu } from '@takeasygo/business'
import type { Product } from '@takeasygo/types'
import { assertItemMatchesCatalog } from '@/lib/pos-online/catalogPrices'
import { PosError } from '@/lib/pos-online/errors'
// La hoja de personalización REAL del POS: el test cubre el camino completo
// carta → POS → validación del server, sin copiar ninguna regla.
import {
  buildOrderItem,
  pendingGroup,
  toggleOption,
  unitTotal,
  visibleGroups,
  type Selections,
} from '../../../pos/src/utils/product-config'

/**
 * Bug 11/11/2026: los platos con VARIANTES (tamaños, porciones) llegaban al POS
 * sin opciones — en mostrador y salón no se podían personalizar y se cobraban
 * al precio base. En producción afectaba a 25 comercios (ej. 99 de 103 platos
 * de un menú). Ahora la variante viaja como grupo obligatorio «Variante».
 */

const ROLL = '64b0000000000000000000a1' // solo variantes
const PIZZA = '64b0000000000000000000a2' // variantes + grupos + grupo propio de variante
const OCULTA = '64b0000000000000000000a3' // variante desactivada
const SIN = '64b0000000000000000000a4' // sin variantes (no cambia)
const CHOQUE = '64b0000000000000000000a5' // ya tiene un grupo llamado «Variante»

const RAW: RawMenu = {
  tenantId: 'tenant',
  categories: [
    {
      _id: 'cat', name: 'Carta', sortOrder: 0,
      customizationGroups: [{ _id: 'gc', name: 'Salsa', type: 'single', options: [{ name: 'Soja', extraPrice: 0 }] }],
      items: [
        { _id: ROLL, name: 'Roll salmón', price: 0, variants: [{ name: '5 piezas', price: 900000 }, { name: '10 piezas', price: 1600000 }] },
        {
          _id: PIZZA, name: 'Muzza', price: 1, // el precio base se ignora si hay variantes
          customizationGroups: [{ _id: 'gb', name: 'Borde', type: 'single', options: [{ name: 'Relleno', extraPrice: 150000 }] }],
          variants: [
            { name: 'Chica', price: 800000 },
            {
              name: 'Grande', price: 1200000,
              customizationGroups: [
                { _id: 'gx', name: 'Extra grande', type: 'multiple', options: [{ name: 'Doble queso', extraPrice: 200000 }] },
                { _id: 'gb2', name: 'Borde', type: 'single', options: [{ name: 'Relleno', extraPrice: 150000 }] }, // ya está arriba
              ],
            },
          ],
        },
        { _id: OCULTA, name: 'Empanada', price: 0, variants: [{ name: 'Carne', price: 150000 }, { name: 'Pollo', price: 140000 }], disabledVariantNames: ['Pollo'] },
        { _id: SIN, name: 'Agua', price: 200000 },
        {
          _id: CHOQUE, name: 'Combo raro', price: 0,
          customizationGroups: [{ _id: 'gv', name: 'Variante', type: 'single', options: [{ name: 'A', extraPrice: 0 }] }],
          variants: [{ name: 'Simple', price: 500000 }],
        },
      ],
    },
  ],
}

const products = new Map<string, Product>(flattenMenuSnapshot([RAW]).products.map((p) => [p.id, p]))
const get = (id: string) => products.get(id) as Product

function pick(product: Product, choices: Array<[string, string]>): Selections {
  let sel: Selections = {}
  for (const [groupKey, option] of choices) {
    const group = visibleGroups(product, sel).find((g) => g.key === groupKey)
    expect(group, `grupo ${groupKey}`).toBeTruthy()
    sel = toggleOption(sel, group!, option)
  }
  return sel
}

describe('Carta del POS — variantes', () => {
  it('un plato con solo variantes llega con un grupo obligatorio y el precio de la más barata', () => {
    const roll = get(ROLL)
    expect(roll.price).toBe(900000)
    const variant = roll.modifiers![0]
    expect(variant).toMatchObject({ name: VARIANT_GROUP_NAME, type: 'single', required: true, maxSelections: 1 })
    expect(variant.options.map((o) => [o.name, o.price])).toEqual([['5 piezas', 0], ['10 piezas', 700000]])
    // Los grupos heredados de la categoría siguen después.
    expect(roll.modifiers!.map((g) => g.name)).toEqual([VARIANT_GROUP_NAME, 'Salsa'])
  })

  it('los grupos propios de una variante cuelgan de su opción (sin repetir los de arriba)', () => {
    const pizza = get(PIZZA)
    expect(pizza.modifiers!.map((g) => g.name)).toEqual([VARIANT_GROUP_NAME, 'Salsa', 'Borde'])
    const [chica, grande] = pizza.modifiers![0].options
    expect(chica.subGroups).toBeUndefined()
    expect(grande.subGroups!.map((g) => g.name)).toEqual(['Extra grande'])
  })

  it('una variante desactivada no aparece', () => {
    expect(get(OCULTA).modifiers![0].options.map((o) => o.name)).toEqual(['Carne'])
    expect(get(OCULTA).price).toBe(150000)
  })

  it('un plato sin variantes no cambia y el nombre del grupo no choca con uno existente', () => {
    expect(get(SIN).price).toBe(200000)
    expect(get(SIN).modifiers?.map((g) => g.name)).toEqual(['Salsa'])
    expect(get(CHOQUE).modifiers!.map((g) => g.name)).toEqual([`${VARIANT_GROUP_NAME} del plato`, 'Salsa', 'Variante'])
  })
})

describe('Hoja del POS + validación del server', () => {
  it('hay que elegir la variante antes de agregar', () => {
    const roll = get(ROLL)
    expect(pendingGroup(visibleGroups(roll, {}), {})?.name).toBe(VARIANT_GROUP_NAME)
  })

  it('10 piezas se cobra a su precio y el server acepta la línea', () => {
    const roll = get(ROLL)
    const sel = pick(roll, [[VARIANT_GROUP_NAME, '10 piezas'], ['Salsa', 'Soja']])
    expect(unitTotal(roll, sel)).toBe(1600000)
    const line = buildOrderItem(roll, sel, '', 2)
    expect(line.total).toBe(3200000)
    expect(line.modifiers).toEqual([
      { name: 'Variante: 10 piezas', price: 700000 },
      { name: 'Salsa: Soja', price: 0 },
    ])
    expect(() => assertItemMatchesCatalog(line, products)).not.toThrow()
  })

  it('pizza grande con el extra propio de esa variante y borde', () => {
    const pizza = get(PIZZA)
    const sel = pick(pizza, [
      [VARIANT_GROUP_NAME, 'Grande'],
      [`${VARIANT_GROUP_NAME}›Grande›Extra grande`, 'Doble queso'],
      ['Salsa', 'Soja'],
      ['Borde', 'Relleno'],
    ])
    expect(unitTotal(pizza, sel)).toBe(1200000 + 200000 + 150000)
    const line = buildOrderItem(pizza, sel, '', 1)
    expect(() => assertItemMatchesCatalog(line, products)).not.toThrow()
    // En la chica el extra de la grande no se ofrece.
    const chica = pick(pizza, [[VARIANT_GROUP_NAME, 'Chica']])
    expect(visibleGroups(pizza, chica).some((g) => g.name === 'Extra grande')).toBe(false)
  })

  it('el server rechaza una variante con precio adulterado o desactivada', () => {
    const base = { productId: ROLL, name: 'Roll salmón', quantity: 1, unitPrice: 900000, total: 900000 }
    expect(() => assertItemMatchesCatalog({ ...base, modifiers: [{ name: 'Variante: 10 piezas', price: 0 }] }, products)).toThrow(PosError)
    expect(() => assertItemMatchesCatalog({ ...base, unitPrice: 0, total: 0 }, products)).toThrow(PosError)
    expect(() =>
      assertItemMatchesCatalog({ productId: OCULTA, name: 'Empanada', quantity: 1, unitPrice: 150000, total: 140000, modifiers: [{ name: 'Variante: Pollo', price: -10000 }] }, products),
    ).toThrow(PosError)
  })
})
