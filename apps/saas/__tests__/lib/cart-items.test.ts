import { describe, it, expect } from 'vitest'
import {
  normalizeStoredCart,
  resolveMaxRewardsPerOrder,
  getRewardLines,
  sumRewardPoints,
  buildRewardPayloadFromCart,
  DEFAULT_MAX_REWARDS_PER_ORDER,
  TECHNICAL_MAX_REWARDS_PER_ORDER,
} from '@/lib/cart-items'
import type { CartItem } from '@/types/cart'

function menuItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    cartItemId: 'abc:plain',
    menuItemId: 'abc',
    name: 'Agua',
    basePrice: 1000,
    extraPrice: 0,
    price: 1000,
    quantity: 2,
    customizations: [],
    customizationSummary: '',
    type: 'menuItem',
    ...overrides,
  }
}

function rewardLine(overrides: Partial<CartItem> = {}): CartItem {
  return menuItem({
    cartItemId: 'store-1',
    menuItemId: undefined,
    name: 'Cachapa',
    basePrice: 0,
    extraPrice: 0,
    price: 0,
    quantity: 1,
    type: 'reward',
    storeItemId: 'store-1',
    pointsCost: 100,
    addedFrom: 'store',
    ...overrides,
  })
}

describe('normalizeStoredCart — formato viejo', () => {
  it('acepta un carrito guardado sin `type` (formato anterior) y lo infiere', () => {
    const raw = [
      { cartItemId: 'a', menuItemId: 'a', name: 'Agua', price: 1000, quantity: 1 },
      { cartItemId: 'b', menuItemId: 'b', promotionId: 'promo-1', name: 'Combo', price: 500, quantity: 1 },
    ]

    const cart = normalizeStoredCart(raw)

    expect(cart).toHaveLength(2)
    expect(cart[0].type).toBe('menuItem')
    expect(cart[1].type).toBe('promotion')
    expect(cart[1].promotionId).toBe('promo-1')
    // no inventa campos: lo demás queda igual
    expect(cart[0].price).toBe(1000)
    expect(cart[0].quantity).toBe(1)
  })

  it('no truena con entradas corruptas o estructuras que no son arrays', () => {
    expect(normalizeStoredCart(null)).toEqual([])
    expect(normalizeStoredCart(undefined)).toEqual([])
    expect(normalizeStoredCart('nope')).toEqual([])
    expect(normalizeStoredCart({ cart: [] })).toEqual([])
    expect(normalizeStoredCart([null, 'str', 42, { name: 'x' }])).toHaveLength(1)
    expect(normalizeStoredCart([{ name: 'x' }])[0].type).toBe('menuItem')
  })
})

describe('normalizeStoredCart — líneas de premio', () => {
  it('una línea de premio válida queda en $0, cantidad 1 y con sus puntos', () => {
    const cart = normalizeStoredCart([rewardLine({ price: 999, quantity: 3 } as Partial<CartItem>)])
    expect(cart).toHaveLength(1)
    expect(cart[0].type).toBe('reward')
    expect(cart[0].storeItemId).toBe('store-1')
    expect(cart[0].pointsCost).toBe(100)
    expect(cart[0].price).toBe(0)
    expect(cart[0].basePrice).toBe(0)
    expect(cart[0].extraPrice).toBe(0)
    expect(cart[0].quantity).toBe(1)
    expect(cart[0].addedFrom).toBe('store')
  })

  it('descarta líneas de premio sin storeItemId o sin pointsCost usable', () => {
    expect(normalizeStoredCart([{ type: 'reward', pointsCost: 100 }])).toEqual([])
    expect(normalizeStoredCart([{ type: 'reward', storeItemId: 'x' }])).toEqual([])
    expect(normalizeStoredCart([{ type: 'reward', storeItemId: 'x', pointsCost: 0 }])).toEqual([])
    expect(
      normalizeStoredCart([{ type: 'reward', storeItemId: 'x', pointsCost: 'nope' }])
    ).toEqual([])
  })
})

describe('resolveMaxRewardsPerOrder', () => {
  it('default 1 cuando no hay config o es inválida', () => {
    expect(resolveMaxRewardsPerOrder(undefined)).toBe(DEFAULT_MAX_REWARDS_PER_ORDER)
    expect(resolveMaxRewardsPerOrder(null)).toBe(DEFAULT_MAX_REWARDS_PER_ORDER)
    expect(resolveMaxRewardsPerOrder({})).toBe(1)
    expect(resolveMaxRewardsPerOrder({ maxRewardsPerOrder: 0 })).toBe(1)
    expect(resolveMaxRewardsPerOrder({ maxRewardsPerOrder: -3 })).toBe(1)
    expect(resolveMaxRewardsPerOrder({ maxRewardsPerOrder: NaN })).toBe(1)
    expect(resolveMaxRewardsPerOrder({ maxRewardsPerOrder: null })).toBe(1)
  })

  it('respeta la config y aplica el tope técnico', () => {
    expect(resolveMaxRewardsPerOrder({ maxRewardsPerOrder: 3 })).toBe(3)
    expect(resolveMaxRewardsPerOrder({ maxRewardsPerOrder: 2.7 })).toBe(2)
    expect(resolveMaxRewardsPerOrder({ maxRewardsPerOrder: 5 })).toBe(TECHNICAL_MAX_REWARDS_PER_ORDER)
    expect(resolveMaxRewardsPerOrder({ maxRewardsPerOrder: 99 })).toBe(5)
  })
})

describe('helpers de premios del carrito', () => {
  const cart = [
    menuItem(),
    rewardLine(),
    rewardLine({ cartItemId: 'store-2', storeItemId: 'store-2', pointsCost: 50 }),
  ]

  it('getRewardLines / sumRewardPoints solo miran las líneas de premio', () => {
    expect(getRewardLines(cart)).toHaveLength(2)
    expect(sumRewardPoints(cart)).toBe(150)
    expect(sumRewardPoints([menuItem()])).toBe(0)
  })

  it('buildRewardPayloadFromCart arma el payload del pedido desde el carrito', () => {
    expect(buildRewardPayloadFromCart([menuItem()])).toBeNull()
    expect(buildRewardPayloadFromCart([])).toBeNull()
    expect(buildRewardPayloadFromCart(cart)).toEqual({
      rewardItems: [{ storeItemId: 'store-1' }, { storeItemId: 'store-2' }],
      loyaltyPointsRequired: 150,
    })
  })

  it('el subtotal del carrito no se mueve por las líneas de premio ($0)', () => {
    const subtotal = [...cart, rewardLine()].reduce((sum, i) => sum + i.price * i.quantity, 0)
    expect(subtotal).toBe(1000 * 2)
  })
})
