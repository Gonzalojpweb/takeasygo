import { describe, it, expect } from 'vitest'
import { flattenMenuSnapshot, type RawMenu } from '@takeasygo/business'
import { assertItemMatchesCatalog } from '@/lib/pos-online/catalogPrices'
import { PosError } from '@/lib/pos-online/errors'
import type { PosOrderItemInput } from '@/lib/pos-online/orderMapper'

/**
 * S1-2 — precios del catálogo server-side.
 *
 * El validador es puro (catálogo ya aplanado), así que estos tests arman el
 * MISMO snapshot que sirve GET /pos/menu con la MISMA regla de flatten.
 * Toda diferencia debe caer en PosError.conflict → 409, nunca pasar calla.
 */

const PRODUCT_A = '64b0000000000000000000aa' // Hamburguesa 1500 + Extras
const PRODUCT_B = '64b0000000000000000000bb' // Papas 500, Ketchup deshabilitado
const PRODUCT_PIZZA1 = '64b0000000000000000000cc' // Muzzarella 1000 / mitad 800
const PRODUCT_PIZZA2 = '64b0000000000000000000dd' // Fugazzeta 1100 / mitad 900
const UNKNOWN_PRODUCT = '64b0000000000000000000ff'

const RAW_MENU: RawMenu = {
  tenantId: 'tenant',
  categories: [
    {
      _id: 'cat1',
      name: 'Platos',
      sortOrder: 0,
      items: [
        {
          _id: PRODUCT_A,
          name: 'Hamburguesa',
          price: 1500,
          customizationGroups: [
            {
              _id: 'g1',
              name: 'Extras',
              type: 'multiple',
              options: [
                { name: 'Papas', extraPrice: 200 },
                { name: 'Queso', extraPrice: 150 },
              ],
            },
          ],
        },
        {
          _id: PRODUCT_B,
          name: 'Papas',
          price: 500,
          customizationGroups: [
            {
              _id: 'g2',
              name: 'Aderezos',
              options: [
                { name: 'Mayonesa', extraPrice: 0 },
                { name: 'Ketchup', extraPrice: 0 },
              ],
            },
          ],
          disabledOptionIds: ['Ketchup'],
        },
        { _id: PRODUCT_PIZZA1, name: 'Muzzarella', price: 1000, halfPrice: 800 },
        { _id: PRODUCT_PIZZA2, name: 'Fugazzeta', price: 1100, halfPrice: 900 },
      ],
    },
  ],
}

const PRODUCTS = new Map(flattenMenuSnapshot([RAW_MENU]).products.map((p) => [p.id, p]))

function item(overrides: Partial<PosOrderItemInput> = {}): PosOrderItemInput {
  return {
    productId: PRODUCT_A,
    name: 'Hamburguesa',
    quantity: 1,
    unitPrice: 1500,
    total: 1500,
    ...overrides,
  }
}

function expectConflict(fn: () => void): PosError {
  let caught: unknown
  try {
    fn()
  } catch (e) {
    caught = e
  }
  expect(caught, 'debió lanzar PosError').toBeInstanceOf(PosError)
  const error = caught as PosError
  expect(error.status).toBe(409)
  expect(error.code).toBe('conflict')
  return error
}

describe('assertItemMatchesCatalog — precio base', () => {
  it('acepta un item con el precio vigente del catálogo', () => {
    expect(() => assertItemMatchesCatalog(item(), PRODUCTS)).not.toThrow()
  })

  it('rechaza un unitPrice por debajo del catálogo', () => {
    const error = expectConflict(() =>
      assertItemMatchesCatalog(item({ unitPrice: 100, total: 100 }), PRODUCTS)
    )
    expect(error.message).toContain('fuera del catálogo')
    expect(error.detail).toBe('unitPrice=100 catalogPrice=1500')
  })

  it('rechaza un unitPrice por encima del catálogo', () => {
    const error = expectConflict(() =>
      assertItemMatchesCatalog(item({ unitPrice: 99999, total: 99999 }), PRODUCTS)
    )
    expect(error.detail).toContain('catalogPrice=1500')
  })

  it('rechaza un productId que no está en el catálogo vigente', () => {
    const error = expectConflict(() =>
      assertItemMatchesCatalog(item({ productId: UNKNOWN_PRODUCT }), PRODUCTS)
    )
    expect(error.message).toContain('fuera del catálogo')
    expect(error.detail).toContain(UNKNOWN_PRODUCT)
  })
})

describe('assertItemMatchesCatalog — modificadores', () => {
  it('acepta un modificador con el precio vigente', () => {
    expect(() =>
      assertItemMatchesCatalog(
        item({ modifiers: [{ name: 'Extras: Papas', price: 200 }], total: 1700 }),
        PRODUCTS
      )
    ).not.toThrow()
  })

  it('rechaza un modificador con precio alterado', () => {
    const error = expectConflict(() =>
      assertItemMatchesCatalog(
        item({ modifiers: [{ name: 'Extras: Papas', price: 1 }], total: 1501 }),
        PRODUCTS
      )
    )
    expect(error.detail).toContain('price=1')
  })

  it('rechaza un modificador que no existe en el catálogo', () => {
    expectConflict(() =>
      assertItemMatchesCatalog(
        item({ modifiers: [{ name: 'Extras: Tocineta', price: 300 }], total: 1800 }),
        PRODUCTS
      )
    )
  })

  it('rechaza una opción deshabilitada en la carta vigente', () => {
    expectConflict(() =>
      assertItemMatchesCatalog(
        item({
          productId: PRODUCT_B,
          name: 'Papas',
          unitPrice: 500,
          modifiers: [{ name: 'Aderezos: Ketchup', price: 0 }],
          total: 500,
        }),
        PRODUCTS
      )
    )
  })

  it('rechaza un modificador con etiqueta de mitad y mitad en producto normal', () => {
    expectConflict(() =>
      assertItemMatchesCatalog(
        item({ modifiers: [{ name: 'Primera mitad: Muzzarella', price: 800 }], total: 2300 }),
        PRODUCTS
      )
    )
  })
})

describe('assertItemMatchesCatalog — mitad y mitad', () => {
  function halfItem(overrides: Partial<PosOrderItemInput> = {}): PosOrderItemInput {
    return {
      productId: PRODUCT_PIZZA1,
      name: 'Muzzarella Mitad y mitad',
      quantity: 1,
      unitPrice: 1700,
      total: 1700,
      modifiers: [
        { name: 'Primera mitad: Muzzarella', price: 800 },
        { name: 'Segunda mitad: Fugazzeta', price: 900 },
      ],
      ...overrides,
    }
  }

  it('acepta h1+h2 según los halfPrice vigentes (800+900)', () => {
    expect(() => assertItemMatchesCatalog(halfItem(), PRODUCTS)).not.toThrow()
  })

  it('rechaza un unitPrice de mitad y mitad que no cierra', () => {
    const error = expectConflict(() =>
      assertItemMatchesCatalog(halfItem({ unitPrice: 1000 }), PRODUCTS)
    )
    expect(error.detail).toBe('unitPrice=1000 catalogPrice=1700')
  })

  it('rechaza un modificador de mitad con precio alterado', () => {
    expectConflict(() =>
      assertItemMatchesCatalog(
        halfItem({
          modifiers: [
            { name: 'Primera mitad: Muzzarella', price: 1 },
            { name: 'Segunda mitad: Fugazzeta', price: 900 },
          ],
        }),
        PRODUCTS
      )
    )
  })

  it('rechaza un sabor que no existe en la carta', () => {
    expectConflict(() =>
      assertItemMatchesCatalog(
        halfItem({
          modifiers: [
            { name: 'Primera mitad: Calabresa', price: 800 },
            { name: 'Segunda mitad: Fugazzeta', price: 900 },
          ],
        }),
        PRODUCTS
      )
    )
  })

  it('rechaza modificadores de mas en modo mitad (el POS manda exactamente 2)', () => {
    expectConflict(() =>
      assertItemMatchesCatalog(
        halfItem({
          modifiers: [
            { name: 'Primera mitad: Muzzarella', price: 800 },
            { name: 'Segunda mitad: Fugazzeta', price: 900 },
            { name: 'Extras: Papas', price: 200 },
          ],
        }),
        PRODUCTS
      )
    )
  })

  it('rechaza un producto que no admite mitad y mitad', () => {
    expectConflict(() =>
      assertItemMatchesCatalog(
        item({
          unitPrice: 1700,
          total: 1700,
          modifiers: [
            { name: 'Primera mitad: Muzzarella', price: 800 },
            { name: 'Segunda mitad: Fugazzeta', price: 900 },
          ],
        }),
        PRODUCTS
      )
    )
  })

  it('permite un producto con mitad vendido entero (precio base normal)', () => {
    expect(() =>
      assertItemMatchesCatalog(
        item({ productId: PRODUCT_PIZZA1, name: 'Muzzarella', unitPrice: 1000, total: 1000 }),
        PRODUCTS
      )
    ).not.toThrow()
  })
})
