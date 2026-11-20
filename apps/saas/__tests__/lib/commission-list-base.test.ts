import { describe, it, expect } from 'vitest'
import { calculateFinalTotal } from '@/lib/pricing'
import { listUnitPrice, productsListTotal } from '@/lib/commission-base'

/**
 * 20/11/2026 — REGLA del dueño: la comisión de TakeasyGO se calcula SIEMPRE
 * sobre el precio full de lista. Ninguna promo ni descuento del comercio la
 * baja, con ningún medio de pago. El recargo al cliente sale de lo que paga.
 */

const PLATFORM = { platformFees: { takeasygoCommissionPercent: 1, takeasygoTransferCommissionPercent: 4, takeasygoCashCommissionPercent: 2 } }

describe('pricing: base a precio de lista', () => {
  it('transferencia: la comisión incluye lo descontado; al cliente se le recarga solo sobre lo que paga', () => {
    // productos cobrados $10.000 (lista $12.000) + envío $1.500
    const r = calculateFinalTotal(1_150_000, 'transfer', {}, PLATFORM, undefined, 'delivery', 150_000, 0, 1_200_000)
    expect(r.commissionListGapAmount).toBe(200_000)
    expect(r.platformFeeAmount).toBe(54_000) // 4 % de ($11.500 + $2.000)
    expect(r.platformFeeCustomerAmount).toBe(46_000) // 4 % de $11.500
    expect(r.finalTotal).toBe(1_150_000 + 46_000)
  })

  it('Mercado Pago: el marketplace_fee suma lo descontado; el total del cliente no cambia', () => {
    const sin = calculateFinalTotal(1_000_000, 'mercadopago', {}, PLATFORM)
    const con = calculateFinalTotal(1_000_000, 'mercadopago', {}, PLATFORM, undefined, 'takeaway', 0, 0, 1_200_000)
    expect(con.finalTotal).toBe(sin.finalTotal)
    expect(con.platformFeeAmount).toBe(Math.ceil((sin.finalTotal + 200_000) * 0.01))
    expect(con.platformFeeAmount).toBeGreaterThan(sin.platformFeeAmount)
  })

  it('efectivo con comisión: base de lista', () => {
    const rules = { enabled: true, cash: { modes: ['takeaway'], percent: null }, transfer: { modes: [] } }
    const r = calculateFinalTotal(900_000, 'cash', { commissionRules: rules } as never, PLATFORM, undefined, 'takeaway', 0, 0, 1_000_000)
    expect(r.platformFeeAmount).toBe(20_000) // 2 % de $10.000 (lista), no de $9.000
    expect(r.platformFeeCustomerAmount).toBe(18_000) // al cliente: 2 % de lo que paga
    expect(r.finalTotal).toBe(900_000 + 18_000)
  })

  it('sin lista (pedidos viejos) o lista menor que lo cobrado: igual que antes', () => {
    const base = calculateFinalTotal(1_150_000, 'transfer', {}, PLATFORM, undefined, 'delivery', 150_000)
    expect(calculateFinalTotal(1_150_000, 'transfer', {}, PLATFORM, undefined, 'delivery', 150_000, 0, null)).toEqual(base)
    expect(calculateFinalTotal(1_150_000, 'transfer', {}, PLATFORM, undefined, 'delivery', 150_000, 0, 500_000).platformFeeAmount).toBe(base.platformFeeAmount)
  })

  it('MP nunca manda un marketplace_fee mayor que el cobro', () => {
    const r = calculateFinalTotal(100, 'mercadopago', {}, PLATFORM, undefined, 'takeaway', 0, 0, 1_000_000_000)
    expect(r.platformFeeAmount).toBeLessThanOrEqual(r.finalTotal)
  })
})

describe('commission-base: productos a precio de lista', () => {
  const menuItems = new Map<string, any>([
    ['burger', { price: 900_000, takeawayPrice: 950_000 }],
    ['pizza', { price: 800_000, originalPrice: 1_000_000 }], // descuento de categoría
    ['papas', { price: 300_000, variants: [{ name: 'Grande', price: 400_000 }] }],
  ])
  const ctx = { mode: 'takeaway', menuItems, promotions: new Map([['promo-sin-pasos', { originalPrice: 2_500_000, price: 2_000_000 }]]), rewardValues: new Map([['premio', 500_000]]) }

  it('precio de lista por modo, con descuento de categoría', () => {
    expect(listUnitPrice(menuItems.get('burger'), 'takeaway')).toBe(950_000)
    expect(listUnitPrice(menuItems.get('burger'), 'dine-in')).toBe(900_000)
    expect(listUnitPrice(menuItems.get('pizza'), 'delivery')).toBe(1_000_000)
  })

  it('promo, combo, categoría, premio con puntos y promo sin pasos', () => {
    const total = productsListTotal(
      [
        // plato suelto con descuento de categoría: cobrado $8.000, lista $10.000
        { itemType: 'menuItem', menuItemId: 'pizza', quantity: 1, basePrice: 800_000, subtotal: 800_000 },
        // promo 2 por $15.000: cada plato a su precio de carta (+ extra gratis)
        { itemType: 'promotion', menuItemId: 'burger', quantity: 1, basePrice: 750_000, extraPrice: 0, subtotal: 750_000, customizations: [{ selectedOptions: [{ extraPrice: 100_000 }] }] },
        { itemType: 'promotion', menuItemId: 'papas', quantity: 1, basePrice: 750_000, subtotal: 750_000, selectedVariant: { name: 'Grande' } },
        // combo: padre con el precio, platos a $0 → cuentan los platos
        { itemType: 'combo', quantity: 1, subtotal: 1_000_000 },
        { itemType: 'menuItem', comboComponent: true, menuItemId: 'burger', quantity: 1, subtotal: 0 },
        { itemType: 'menuItem', comboComponent: true, menuItemId: 'papas', quantity: 1, subtotal: 0 },
        // premio canjeado con puntos: $0 pero comisiona por su valor
        { itemType: 'reward', storeItemId: 'premio', quantity: 1, subtotal: 0 },
        // promo sin pasos: su precio original
        { itemType: 'promotion', promotionId: 'promo-sin-pasos', quantity: 1, subtotal: 2_000_000 },
      ],
      ctx
    )
    expect(total).toBe(
      1_000_000 + // pizza a lista
        (950_000 + 100_000) + 400_000 + // promo
        950_000 + 300_000 + // combo
        500_000 + // premio
        2_500_000 // promo sin pasos
    )
  })

  it('nunca menos que lo cobrado (mitad y mitad, carta sin el plato)', () => {
    expect(productsListTotal([{ itemType: 'menuItem', menuItemId: 'burger', quantity: 1, basePrice: 0, subtotal: 1_200_000 }], ctx)).toBe(1_200_000)
    expect(productsListTotal([{ itemType: 'promotion', menuItemId: 'no-existe', quantity: 2, subtotal: 600_000 }], ctx)).toBe(600_000)
  })
})
