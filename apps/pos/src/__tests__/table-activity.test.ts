import { describe, it, expect } from "vitest"
import type { Order } from "@takeasygo/types"
import { summarizeTableActivity, formatElapsed } from "../hooks/useTableActivity"
import { contextsForRole } from "../components/layout/contexts"

/**
 * ROS — la Mesa muestra "nombre, estado, tiempo o monto" (Counter v2 §4).
 * Como la Mesa no guarda apertura ni monto, se derivan de sus órdenes POS
 * abiertas (BDL: "Una Mesa contiene Pedidos").
 */

function order(partial: Partial<Order>): Order {
  return {
    id: crypto.randomUUID(),
    tenantId: "t",
    source: "pos",
    status: "confirmed",
    items: [],
    total: 0,
    menuVersion: 1,
    createdAt: new Date("2026-10-21T20:00:00Z"),
    updatedAt: new Date("2026-10-21T20:00:00Z"),
    ...partial,
  }
}

describe("summarizeTableActivity", () => {
  it("suma las rondas abiertas, toma la primera como apertura y separa lo cobrado", () => {
    const map = summarizeTableActivity([
      order({ tableId: "m1", total: 1000, createdAt: new Date("2026-10-21T20:10:00Z") }),
      order({ tableId: "m1", total: 500, createdAt: new Date("2026-10-21T20:00:00Z"), payments: [{ method: "cash", amount: 500 }] }),
      order({ tableId: "m2", total: 700 }),
    ])
    expect(map.get("m1")).toEqual({
      total: 1500,
      unpaid: 1000,
      openedAt: new Date("2026-10-21T20:00:00Z"),
      rounds: 2,
    })
    expect(map.get("m2")?.rounds).toBe(1)
  })

  it("ignora órdenes cerradas, sin mesa o que no son del POS", () => {
    const map = summarizeTableActivity([
      order({ tableId: "m1", status: "delivered", total: 1 }),
      order({ tableId: "m1", status: "cancelled", total: 1 }),
      order({ total: 1 }),
      order({ tableId: "m1", source: "external", total: 1 }),
    ])
    expect(map.size).toBe(0)
  })
})

describe("formatElapsed", () => {
  it("minutos y horas", () => {
    const from = new Date("2026-10-21T20:00:00Z")
    expect(formatElapsed(from, from.getTime() + 35 * 60_000)).toBe("35 min")
    expect(formatElapsed(from, from.getTime() + 65 * 60_000)).toBe("1 h 05 min")
  })
})

describe("contextsForRole (Operational Roles Matrix)", () => {
  it("el cajero no ve Ventas (reportes); manager y admin sí", () => {
    expect(contextsForRole("cashier").map((c) => c.id)).not.toContain("ventas")
    expect(contextsForRole("manager").map((c) => c.id)).toContain("ventas")
    expect(contextsForRole("admin").map((c) => c.id)).toContain("ventas")
  })

  it("rol desconocido cae al mínimo (cajero), nunca a todo", () => {
    expect(contextsForRole(undefined).map((c) => c.id)).not.toContain("ventas")
    expect(contextsForRole("superhacker").map((c) => c.id)).not.toContain("ventas")
  })
})
