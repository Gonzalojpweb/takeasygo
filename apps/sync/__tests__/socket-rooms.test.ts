import { describe, it, expect } from "vitest"
import { resolveSocketRooms, orderBroadcastRooms } from "../src/socket/rooms"

/**
 * Aislamiento de sockets por sede (Oleada 1).
 *
 * Propiedad crítica: un POS multi-sede (con locationId) NO debe entrar a la
 * sala genérica `tenant:{id}`, porque los eventos de pedido se emiten a esa
 * sala para el modo legacy. Si entrara, vería pedidos de otras sedes.
 *
 * La validación E2E (servidor real + Redis) vive en
 * apps/sync/scripts/e-validate/socket-isolation.ts.
 */

describe("resolveSocketRooms — aislamiento por sede", () => {
  it("POS multi-sede: entra SOLO a su sala de location (no a la genérica)", () => {
    const rooms = resolveSocketRooms({
      tenantId: "T1",
      deviceType: "hub",
      locationId: "L1",
    })
    expect(rooms).toContain("tenant:T1:hub")
    expect(rooms).toContain("tenant:T1:location:L1")
    expect(rooms).not.toContain("tenant:T1")
  })

  it("POS legacy single-sede: entra a la sala genérica (no a ninguna de location)", () => {
    const rooms = resolveSocketRooms({
      tenantId: "T1",
      deviceType: "hub",
      locationId: null,
    })
    expect(rooms).toEqual(["tenant:T1:hub", "tenant:T1"])
    expect(rooms.some((r) => r.includes(":location:"))).toBe(false)
  })

  it("locationId ausente se comporta como legacy", () => {
    const rooms = resolveSocketRooms({ tenantId: "T1", deviceType: "spoke" })
    expect(rooms).toEqual(["tenant:T1:spoke", "tenant:T1"])
  })

  it("sala de device respeta el deviceType", () => {
    const rooms = resolveSocketRooms({
      tenantId: "T1",
      deviceType: "spoke",
      locationId: "L2",
    })
    expect(rooms[0]).toBe("tenant:T1:spoke")
    expect(rooms).toContain("tenant:T1:location:L2")
  })

  it("dos sedes distintas del mismo tenant no comparten sala de location", () => {
    const a = resolveSocketRooms({ tenantId: "T1", deviceType: "hub", locationId: "L1" })
    const b = resolveSocketRooms({ tenantId: "T1", deviceType: "hub", locationId: "L2" })
    const locA = a.find((r) => r.includes(":location:"))
    const locB = b.find((r) => r.includes(":location:"))
    expect(locA).not.toBe(locB)
  })
})

describe("orderBroadcastRooms — salas de emisión de eventos", () => {
  it("con locationId: emite a genérica (legacy) + location", () => {
    expect(orderBroadcastRooms("T1", "L1")).toEqual(["tenant:T1", "tenant:T1:location:L1"])
  })

  it("sin locationId: emite solo a la genérica", () => {
    expect(orderBroadcastRooms("T1", null)).toEqual(["tenant:T1"])
  })
})
