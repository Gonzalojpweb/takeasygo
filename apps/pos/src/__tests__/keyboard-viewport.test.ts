import { describe, it, expect } from "vitest"
import { keyboardInset } from "../services/keyboard-viewport"

// Obs. UX 30/10: con el teclado de pantalla abierto la app se ajusta al alto visible.
describe("keyboardInset", () => {
  it("teclado abierto (iPad): devuelve lo que tapa", () => {
    expect(keyboardInset(1024, 650)).toBe(374)
  })

  it("barras del navegador o redondeos chicos no cuentan como teclado", () => {
    expect(keyboardInset(800, 760)).toBe(0)
    expect(keyboardInset(800, 800)).toBe(0)
  })

  it("Android con resizes-content (ya achicó la página): 0", () => {
    expect(keyboardInset(520, 520)).toBe(0)
  })
})
