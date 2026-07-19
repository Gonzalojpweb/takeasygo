import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock Dexie before importing sync-cash ─────────────────────────
const mockRegisters: any[] = []
const mockPending: any[] = []

vi.mock("../db/dexie", () => ({
  db: {
    cashRegister: {
      where: () => ({
        equals: () => ({
          toArray: () => Promise.resolve(mockRegisters),
        }),
      }),
      get: (id: string) => Promise.resolve(mockRegisters.find((r) => r.id === id)),
      put: (reg: any) => {
        const idx = mockRegisters.findIndex((r) => r.id === reg.id)
        if (idx >= 0) mockRegisters[idx] = reg
        else mockRegisters.push(reg)
        return Promise.resolve(reg.id)
      },
    },
    pendingMovements: {
      add: (item: any) => {
        mockPending.push(item)
        return Promise.resolve(item.id)
      },
      where: () => ({
        equals: () => ({
          toArray: () => Promise.resolve(mockPending),
        }),
      }),
    },
  },
}))

// Mock cash.ts functions
vi.mock("../services/cash", () => ({
  addMovement: vi.fn(async (_tenantId: string, registerId: string, type: string, amount: number, reason: string, userId: string, channel: string, paymentMethod: string, relatedOrderId?: string) => {
    const movement = {
      id: crypto.randomUUID(),
      type,
      amount,
      reason,
      userId,
      timestamp: new Date(),
      relatedOrderId,
      channel,
      paymentMethod,
    }
    const reg = mockRegisters.find((r: any) => r.id === registerId)
    if (reg) {
      reg.movements = [...reg.movements, movement]
    }
    return { movement, register: reg }
  }),
  getRegisterForChannel: vi.fn(async (tenantId: string, channel: string) => {
    return mockRegisters.find(
      (r: any) => r.tenantId === tenantId && r.status === "open" && (r.defaultForChannel === channel || r.defaultForChannel === null)
    )
  }),
}))

import { handleTakeasyGOSale } from "../services/sync-cash"

describe("handleTakeasyGOSale", () => {
  beforeEach(() => {
    mockRegisters.length = 0
    mockPending.length = 0
  })

  it("registra venta en caja abierta con defaultForChannel", async () => {
    mockRegisters.push({
      id: "reg_1",
      tenantId: "tenant_1",
      status: "open",
      defaultForChannel: "takeasygo",
      movements: [],
    })

    const result = await handleTakeasyGOSale({
      orderId: "ord_1",
      tenantId: "tenant_1",
      amount: 4500,
      paymentMethod: "mercadopago",
      orderMode: "delivery",
    })

    expect(result.status).toBe("registered")
    if (result.status === "registered") {
      expect(result.movementId).toBeDefined()
    }
  })

  it("guarda en pendingMovements cuando no hay caja abierta", async () => {
    const result = await handleTakeasyGOSale({
      orderId: "ord_2",
      tenantId: "tenant_1",
      amount: 3000,
      paymentMethod: "cash",
      orderMode: "takeaway",
    })

    expect(result.status).toBe("pending")
    expect(mockPending.length).toBe(1)
    expect(mockPending[0].relatedOrderId).toBe("ord_2")
  })

  it("detecta duplicados por relatedOrderId", async () => {
    mockRegisters.push({
      id: "reg_1",
      tenantId: "tenant_1",
      status: "open",
      defaultForChannel: null,
      movements: [
        {
          id: "mov_existing",
          type: "sale",
          relatedOrderId: "ord_dup",
          amount: 100,
          channel: "takeasygo",
          paymentMethod: "cash",
        },
      ],
    })

    const result = await handleTakeasyGOSale({
      orderId: "ord_dup",
      tenantId: "tenant_1",
      amount: 100,
      paymentMethod: "cash",
      orderMode: "delivery",
    })

    expect(result.status).toBe("duplicate")
    if (result.status === "duplicate") {
      expect(result.existingMovementId).toBe("mov_existing")
    }
  })

  it("mapea dine-in a channel counter", async () => {
    mockRegisters.push({
      id: "reg_1",
      tenantId: "tenant_1",
      status: "open",
      defaultForChannel: "counter",
      movements: [],
    })

    const result = await handleTakeasyGOSale({
      orderId: "ord_dinein",
      tenantId: "tenant_1",
      amount: 2500,
      paymentMethod: "cash",
      orderMode: "dine-in",
    })

    expect(result.status).toBe("registered")
  })

  it("mapea takeaway a channel takeasygo", async () => {
    mockRegisters.push({
      id: "reg_1",
      tenantId: "tenant_1",
      status: "open",
      defaultForChannel: "takeasygo",
      movements: [],
    })

    const result = await handleTakeasyGOSale({
      orderId: "ord_takeaway",
      tenantId: "tenant_1",
      amount: 1800,
      paymentMethod: "mercadopago",
      orderMode: "takeaway",
    })

    expect(result.status).toBe("registered")
  })
})
