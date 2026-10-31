import { describe, it, expect } from "vitest"
import { sanitizeDisplay } from "../src/services/order-translator"

// Pedidos App (30/10/2026): número, cliente y entrega que el SaaS manda para
// el POS. El body es externo: solo campos conocidos, texto y acotado.
describe("sanitizeDisplay", () => {
  it("deja los campos conocidos, recortados", () => {
    expect(sanitizeDisplay({ orderNumber: " 1043 ", customerName: "Lucía", customerPhone: "11 5823-4410", deliveryAddress: "Corrientes 4521" }))
      .toEqual({ orderNumber: "1043", customerName: "Lucía", customerPhone: "11 5823-4410", deliveryAddress: "Corrientes 4521" })
  })

  it("descarta lo desconocido, lo que no es texto y lo vacío; acota el largo", () => {
    const d = sanitizeDisplay({ customerName: "x".repeat(500), email: "a@b.c", orderNumber: 1043, customerPhone: "  " })
    expect(d).toEqual({ customerName: "x".repeat(120) })
    expect(sanitizeDisplay(null)).toBeUndefined()
    expect(sanitizeDisplay({ foo: "bar" })).toBeUndefined()
  })
})
