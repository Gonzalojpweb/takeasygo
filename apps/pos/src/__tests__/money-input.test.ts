import { describe, it, expect } from "vitest"
import { parsePesosInput, centsToPesosInput } from "../utils/format"

/**
 * Auditoría POS Online V1 §6.4 — Caja mandaba `parseFloat(input)` (PESOS) a
 * un server que exige CENTAVOS enteros: $1000 quedaba como $10 y $1000,50
 * era rechazado. parsePesosInput es la única conversión de lo que tipea el
 * cajero.
 */
describe("parsePesosInput", () => {
  it("$1000 son 100000 centavos (no 1000)", () => {
    expect(parsePesosInput("1000")).toBe(100000)
  })

  it("acepta decimales con punto o coma, y miles con punto si hay coma", () => {
    expect(parsePesosInput("1000.5")).toBe(100050)
    expect(parsePesosInput("1000,50")).toBe(100050)
    expect(parsePesosInput("1.000,50")).toBe(100050)
    expect(parsePesosInput("$ 250")).toBe(25000)
  })

  it("evita el drift de float", () => {
    expect(parsePesosInput("0,29")).toBe(29)
    expect(parsePesosInput("19,99")).toBe(1999)
  })

  it("rechaza basura, negativos y más de 2 decimales", () => {
    expect(parsePesosInput("")).toBeNull()
    expect(parsePesosInput("abc")).toBeNull()
    expect(parsePesosInput("-10")).toBeNull()
    expect(parsePesosInput("10.001")).toBeNull()
    expect(parsePesosInput("1e5")).toBeNull()
  })

  it("centsToPesosInput es la inversa para precargar inputs", () => {
    expect(centsToPesosInput(100050)).toBe("1000,50")
    expect(parsePesosInput(centsToPesosInput(12345))).toBe(12345)
  })
})
