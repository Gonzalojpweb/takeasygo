import { describe, it, expect } from "vitest"
import type { Order } from "@takeasygo/types"
import { customerLabel, readableText, whatsappNumber } from "../components/IncomingOrders/AppOrders"

// Piloto 06/11: datos del cliente legibles en Pedidos App.
describe("datos del cliente en Pedidos App", () => {
  it("un dato que llegó cifrado (pedidos viejos) no se muestra", () => {
    expect(readableText("a1b2c3d4e5f6a7b8c9d0:0f1e2d3c4b5a69788796:abcdef")).toBeUndefined()
    expect(customerLabel({ display: { customerName: "a1b2c3d4e5f6a7b8c9d0:0f1e2d3c4b5a69788796:abcdef" } } as Order)).toBe("Cliente de la App")
  })

  it("un nombre normal se muestra", () => {
    expect(customerLabel({ display: { customerName: " Lucía Fernández " } } as Order)).toBe("Lucía Fernández")
  })

  it("WhatsApp: solo dígitos y con 54 si es local", () => {
    expect(whatsappNumber("+54 9 11 5823-4410")).toBe("5491158234410")
    expect(whatsappNumber("011 5823 4410")).toBe("541158234410")
  })
})
