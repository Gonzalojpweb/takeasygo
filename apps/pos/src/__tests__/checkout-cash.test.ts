import { describe, it, expect } from "vitest"
import { quickCashOptions } from "../components/shared/CheckoutPanel"
import { expectedDiscountCents } from "../services/order"

/** Fase E (2026-10): cobro claro y descuento del Mostrador. */
describe("quickCashOptions", () => {
  it("el justo primero y redondeos hacia arriba a billetes comunes", () => {
    // $8.750 → justo, $9.000 (1000), $10.000 (2000/10000), $20.000
    expect(quickCashOptions(875_000)).toEqual([875_000, 900_000, 1_000_000, 2_000_000])
  })
  it("sin repetidos ni montos menores al total", () => {
    const opts = quickCashOptions(1_000_000)
    expect(opts[0]).toBe(1_000_000)
    expect(new Set(opts).size).toBe(opts.length)
    expect(opts.every((o) => o >= 1_000_000)).toBe(true)
  })
  it("nada que cobrar → sin opciones", () => {
    expect(quickCashOptions(0)).toEqual([])
  })
})

describe("expectedDiscountCents (espejo del server)", () => {
  it("el % se redondea por línea como el server", () => {
    expect(expectedDiscountCents([3333, 3333], { kind: "percent", value: 10 })).toBe(666)
  })
  it("el monto nunca supera el total", () => {
    expect(expectedDiscountCents([1000, 500], { kind: "amount", value: 99_999 })).toBe(1500)
  })
})
