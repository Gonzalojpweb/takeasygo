import { describe, it, expect } from "vitest"
import { evaluate, formatCalc } from "../utils/calc"

describe("calculadora de apoyo", () => {
  it("cuánto falta: 43450 − 10000 − 13000", () => {
    expect(evaluate("43450-10000-13000")).toBe(20450)
  })

  it("precedencia normal y símbolos de la calculadora", () => {
    expect(evaluate("1000 + 2 × 500")).toBe(2000)
    expect(evaluate("43450 ÷ 3")).toBe(14483.33)
    expect(evaluate("43450 − 450")).toBe(43000)
  })

  it("porcentajes como en una calculadora de caja", () => {
    expect(evaluate("43450 × 10%")).toBe(4345)
    expect(evaluate("43450 + 10%")).toBe(47795)
    expect(evaluate("43450 - 10%")).toBe(39105)
  })

  it("acepta miles con punto y decimales con coma", () => {
    expect(evaluate("43.450 + 1.000,50")).toBe(44450.5)
    expect(evaluate("10,5 * 2")).toBe(21)
  })

  it("signo inicial negativo", () => {
    expect(evaluate("-500 + 200")).toBe(-300)
  })

  it("incompleta, inválida o dividida por cero da null (nunca ejecuta texto)", () => {
    expect(evaluate("43450 +")).toBeNull()
    expect(evaluate("")).toBeNull()
    expect(evaluate("alert(1)")).toBeNull()
    expect(evaluate("100 / 0")).toBeNull()
  })

  it("formato argentino", () => {
    expect(formatCalc(43450)).toBe("43.450")
    expect(formatCalc(14483.33)).toBe("14.483,33")
  })
})
