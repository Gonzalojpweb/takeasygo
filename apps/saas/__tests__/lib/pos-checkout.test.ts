import { describe, it, expect } from 'vitest'
import {
  allocatePayments,
  cashChange,
  isCheckoutComplete,
  pathToDelivered,
  remainingToPay,
  splitEvenly,
  type CheckoutPart,
} from '@takeasygo/business'

/**
 * Checkout del POS (@takeasygo/business/checkout) — Auditoría §5.
 * El split anterior usaba Math.ceil(total / n) y cobraba de más.
 */

describe('splitEvenly', () => {
  it('suma exactamente el total, sin centavos de más', () => {
    const parts = splitEvenly(1000, 3)
    expect(parts).toEqual([334, 333, 333])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000)
  })

  it('rechaza entradas inválidas', () => {
    expect(() => splitEvenly(10.5, 2)).toThrow()
    expect(() => splitEvenly(100, 0)).toThrow()
  })
})

describe('isCheckoutComplete / remainingToPay / cashChange', () => {
  it('solo completo con suma exacta y partes > 0', () => {
    expect(isCheckoutComplete(1000, [{ amount: 400 }, { amount: 600 }])).toBe(true)
    expect(isCheckoutComplete(1000, [{ amount: 400 }])).toBe(false)
    expect(isCheckoutComplete(1000, [{ amount: 1000 }, { amount: 0 }])).toBe(false)
    expect(isCheckoutComplete(1000, [])).toBe(false)
    expect(remainingToPay(1000, [{ amount: 1200 }])).toBe(-200)
  })

  it('vuelto', () => {
    expect(cashChange(1500, 2000)).toBe(500)
    expect(cashChange(1500, 1000)).toBe(0)
  })
})

const part = (id: string, method: CheckoutPart['method'], amount: number): CheckoutPart => ({ id, method, amount })

describe('allocatePayments', () => {
  it('una orden: las partes pasan tal cual con su id', () => {
    const map = allocatePayments([{ id: 'o1', total: 1000 }], [part('a', 'cash', 400), part('b', 'mercadopago', 600)])
    expect(map.get('o1')).toEqual([
      { id: 'a', method: 'cash', amount: 400 },
      { id: 'b', method: 'mercadopago', amount: 600 },
    ])
  })

  it('varias órdenes: cada una recibe exactamente su total y la parte partida lleva sufijo', () => {
    const map = allocatePayments(
      [
        { id: 'o1', total: 700 },
        { id: 'o2', total: 300 },
      ],
      [part('a', 'cash', 500), part('b', 'posnet_debit', 500)]
    )
    expect(map.get('o1')).toEqual([
      { id: 'a', method: 'cash', amount: 500 },
      { id: 'b:o1', method: 'posnet_debit', amount: 200 },
    ])
    expect(map.get('o2')).toEqual([{ id: 'b:o2', method: 'posnet_debit', amount: 300 }])
  })

  it('es determinístico (mismos ids en un reintento)', () => {
    const orders = [
      { id: 'o1', total: 250 },
      { id: 'o2', total: 750 },
    ]
    const parts = [part('a', 'cash', 1000)]
    expect(allocatePayments(orders, parts)).toEqual(allocatePayments(orders, parts))
  })

  it('rechaza partes que no cubren el total', () => {
    expect(() => allocatePayments([{ id: 'o1', total: 1000 }], [part('a', 'cash', 999)])).toThrow()
  })
})

describe('pathToDelivered', () => {
  it('sigue el grafo en vez de saltearlo', () => {
    expect(pathToDelivered('pending')).toEqual(['delivered'])
    expect(pathToDelivered('confirmed')).toEqual(['preparing', 'ready', 'delivered'])
    expect(pathToDelivered('ready')).toEqual(['delivered'])
    expect(pathToDelivered('delivered')).toEqual([])
    expect(pathToDelivered('cancelled')).toBeNull()
  })
})
