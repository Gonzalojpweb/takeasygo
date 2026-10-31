import { describe, it, expect } from "vitest"
import type { Order } from "@takeasygo/types"
import { customerLabel, matchesFilter, nextStep, orderNumberLabel, payStateOf } from "../components/IncomingOrders/AppOrders"

// Pedidos App (maqueta aprobada 30/10/2026).
const o = (over: Partial<Order>): Order => ({
  id: "6a65a4c1aa", tenantId: "t", source: "external", status: "pending", items: [], total: 100, menuVersion: 1,
  createdAt: new Date(), updatedAt: new Date(), ...over,
}) as Order

describe("datos que se muestran", () => {
  it("número y cliente del SaaS; si falta, algo legible", () => {
    expect(orderNumberLabel(o({ display: { orderNumber: "1043" } }))).toBe("#1043")
    expect(orderNumberLabel(o({}))).toBe("#A4C1AA")
    expect(customerLabel(o({ display: { customerName: "Lucía" } }))).toBe("Lucía")
    expect(customerLabel(o({}))).toBe("Cliente de la App")
  })

  it("estado del pago", () => {
    expect(payStateOf(o({ paymentMethod: "cash", externalStatus: "confirmed" }))).toBe("cash")
    expect(payStateOf(o({ paymentMethod: "transfer", externalStatus: "awaiting_payment" }))).toBe("transfer_pending")
    expect(payStateOf(o({ paymentMethod: "mercadopago", externalStatus: "awaiting_payment" }))).toBe("mp_pending")
    expect(payStateOf(o({ paymentMethod: "mercadopago", externalStatus: "confirmed" }))).toBe("paid")
  })

  it("filtros", () => {
    const del = o({ orderMode: "delivery" })
    const take = o({ orderMode: "takeaway", paymentMethod: "transfer", externalStatus: "awaiting_payment" })
    expect(matchesFilter(del, "delivery")).toBe(true)
    expect(matchesFilter(del, "takeaway")).toBe(false)
    expect(matchesFilter(take, "takeaway")).toBe(true)
    expect(matchesFilter(take, "pay")).toBe(true)
  })
})

describe("En curso: próximo paso", () => {
  it("para llevar: Empezar → Marcar listo → Entregado", () => {
    expect(nextStep(o({ status: "confirmed" }))?.status).toBe("preparing")
    expect(nextStep(o({ status: "preparing" }))?.status).toBe("ready")
    expect(nextStep(o({ status: "ready", orderMode: "takeaway" }))?.status).toBe("delivered")
  })

  it("delivery (antes nunca se detectaba): Salió → Llegó → Entregado", () => {
    expect(nextStep(o({ status: "ready", orderMode: "delivery" }))).toEqual({ label: "Salió el delivery", status: "en_ruta" })
    expect(nextStep(o({ status: "en_ruta", orderMode: "delivery" }))?.status).toBe("arrived")
    expect(nextStep(o({ status: "arrived", orderMode: "delivery" }))?.status).toBe("delivered")
    expect(nextStep(o({ status: "delivered" }))).toBeNull()
  })
})
