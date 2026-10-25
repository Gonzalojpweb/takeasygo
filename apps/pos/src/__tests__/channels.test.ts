import { describe, it, expect } from "vitest"
import { isAppOrder, isExternalDeliveryOrder } from "../services/channels"

/** Obs. 24/10: Pedidos App y Delivery externo son vistas separadas. */
describe("canales de pedidos externos", () => {
  it("un pedido externo sin canal es de la App TakeasyGO", () => {
    expect(isAppOrder({ source: "external" })).toBe(true)
    expect(isExternalDeliveryOrder({ source: "external" })).toBe(false)
  })

  it("una plataforma de delivery va a Delivery externo y no a Pedidos App", () => {
    const order = { source: "external" as const, channel: "pedidosya" }
    expect(isExternalDeliveryOrder(order)).toBe(true)
    expect(isAppOrder(order)).toBe(false)
  })

  it("los pedidos del POS no son de ningún canal externo", () => {
    expect(isAppOrder({ source: "pos" })).toBe(false)
    expect(isExternalDeliveryOrder({ source: "pos", channel: "rappi" })).toBe(false)
  })
})

import { saleChannelOf } from "../services/channels"

describe("canal de una venta (Ventas)", () => {
  it("mesa → Salón; sin mesa → Mostrador; externo → App; plataforma → Delivery", () => {
    expect(saleChannelOf({ source: "pos", tableId: "mesa-1" })).toBe("salon")
    expect(saleChannelOf({ source: "pos" })).toBe("mostrador")
    expect(saleChannelOf({ source: "external" })).toBe("app")
    expect(saleChannelOf({ source: "external", channel: "rappi" })).toBe("delivery")
  })
})
