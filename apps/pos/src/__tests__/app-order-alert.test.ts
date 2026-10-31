import { describe, it, expect } from "vitest"
import type { Order } from "@takeasygo/types"
import { isPendingAppOrder } from "../hooks/useAppOrderAlert"

// Obs. UX 30/10: avisan (sonido que insiste, aviso arriba) solo los pedidos
// de la App que nadie aceptó todavía.
const base = { id: "o1", tenantId: "t", source: "external", status: "pending", items: [], total: 100, menuVersion: 1, createdAt: new Date(), updatedAt: new Date() } as unknown as Order

describe("isPendingAppOrder", () => {
  it("pedido de la App sin aceptar → avisa", () => {
    expect(isPendingAppOrder(base)).toBe(true)
    expect(isPendingAppOrder({ ...base, channel: "takeasygo" })).toBe(true)
  })

  it("aceptado, cancelado, entregado, delivery externo o venta del POS → no avisa", () => {
    expect(isPendingAppOrder({ ...base, integratedAt: new Date() })).toBe(false)
    expect(isPendingAppOrder({ ...base, status: "cancelled" })).toBe(false)
    expect(isPendingAppOrder({ ...base, status: "delivered" })).toBe(false)
    expect(isPendingAppOrder({ ...base, channel: "pedidosya" })).toBe(false)
    expect(isPendingAppOrder({ ...base, source: "pos" } as Order)).toBe(false)
  })
})
