import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock Dexie ────────────────────────────────────────────────────
const mockOrders: any[] = []
const mockPendingEvents: any[] = []

vi.mock("../db/dexie", () => ({
  db: {
    orders: {
      get: (id: string) => Promise.resolve(mockOrders.find((o) => o.id === id)),
      add: (order: any) => {
        mockOrders.push({ ...order })
        return Promise.resolve(order.id)
      },
      update: (id: string, changes: any) => {
        const idx = mockOrders.findIndex((o) => o.id === id)
        if (idx >= 0) {
          mockOrders[idx] = { ...mockOrders[idx], ...changes }
        }
        return Promise.resolve(1)
      },
    },
    pendingEvents: {
      add: (event: any) => {
        mockPendingEvents.push({ ...event })
        return Promise.resolve(event.id)
      },
    },
    tenantConfig: {
      get: (_tenantId: string) =>
        Promise.resolve({ deviceSecret: "test-secret" }),
    },
  },
}))

vi.mock("../services/event-queue", () => ({
  enqueue: vi.fn(async (tenantId: string, type: string, payload: unknown) => {
    const event = {
      id: `evt-${mockPendingEvents.length}`,
      tenantId,
      type,
      payload,
      timestamp: new Date(),
      nonce: "test-nonce",
      signature: "test-sig",
      status: "pending",
      retryCount: 0,
    }
    mockPendingEvents.push(event)
    return event
  }),
}))

import { confirmOrder, prepareOrder, markReady, deliverOrder, cancelOrder } from "../services/order"
import { enqueue } from "../services/event-queue"

// ── Helpers ───────────────────────────────────────────────────────

function makeOrder(overrides: Partial<any> = {}): any {
  return {
    id: "order-1",
    tenantId: "tenant-1",
    source: "external",
    status: "pending",
    items: [{ productId: "p1", name: "Hamburguesa", quantity: 1, unitPrice: 500, total: 500 }],
    total: 500,
    menuVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  mockOrders.length = 0
  mockPendingEvents.length = 0
  vi.clearAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────

describe("Order status transitions", () => {
  describe("prepareOrder", () => {
    it("transitions pending → preparing", async () => {
      mockOrders.push(makeOrder({ status: "pending" }))

      await prepareOrder("tenant-1", "order-1")

      expect(mockOrders[0].status).toBe("preparing")
      expect(enqueue).toHaveBeenCalledWith("tenant-1", "order.preparing", {
        orderId: "order-1",
        tableId: undefined,
        source: "external",
      })
    })

    it("transitions confirmed → preparing", async () => {
      mockOrders.push(makeOrder({ status: "confirmed" }))

      await prepareOrder("tenant-1", "order-1")

      expect(mockOrders[0].status).toBe("preparing")
    })

    it("rejects invalid transition: preparing → preparing", async () => {
      mockOrders.push(makeOrder({ status: "preparing" }))

      await expect(prepareOrder("tenant-1", "order-1")).rejects.toThrow(
        "Invalid transition: preparing → preparing"
      )
    })

    it("rejects invalid transition: delivered → preparing", async () => {
      mockOrders.push(makeOrder({ status: "delivered" }))

      await expect(prepareOrder("tenant-1", "order-1")).rejects.toThrow(
        "Invalid transition: delivered → preparing"
      )
    })

    it("rejects tenant mismatch", async () => {
      mockOrders.push(makeOrder({ tenantId: "other-tenant" }))

      await expect(prepareOrder("tenant-1", "order-1")).rejects.toThrow(
        "Tenant mismatch"
      )
    })

    it("rejects non-existent order", async () => {
      await expect(prepareOrder("tenant-1", "nonexistent")).rejects.toThrow(
        "not found"
      )
    })
  })

  describe("markReady", () => {
    it("transitions preparing → ready", async () => {
      mockOrders.push(makeOrder({ status: "preparing" }))

      await markReady("tenant-1", "order-1")

      expect(mockOrders[0].status).toBe("ready")
      expect(enqueue).toHaveBeenCalledWith("tenant-1", "order.ready", {
        orderId: "order-1",
        tableId: undefined,
        source: "external",
      })
    })

    it("rejects invalid transition: confirmed → ready", async () => {
      mockOrders.push(makeOrder({ status: "confirmed" }))

      await expect(markReady("tenant-1", "order-1")).rejects.toThrow(
        "Invalid transition: confirmed → ready"
      )
    })

    it("rejects invalid transition: ready → ready", async () => {
      mockOrders.push(makeOrder({ status: "ready" }))

      await expect(markReady("tenant-1", "order-1")).rejects.toThrow(
        "Invalid transition: ready → ready"
      )
    })

    it("rejects tenant mismatch", async () => {
      mockOrders.push(makeOrder({ tenantId: "other-tenant" }))

      await expect(markReady("tenant-1", "order-1")).rejects.toThrow(
        "Tenant mismatch"
      )
    })
  })

  describe("deliverOrder", () => {
    it("transitions ready → delivered", async () => {
      mockOrders.push(makeOrder({ status: "ready" }))

      await deliverOrder("tenant-1", "order-1")

      expect(mockOrders[0].status).toBe("delivered")
      expect(enqueue).toHaveBeenCalledWith("tenant-1", "order.delivered", {
        orderId: "order-1",
        tableId: undefined,
        total: 500,
      })
    })

    it("rejects invalid transition: preparing → delivered", async () => {
      mockOrders.push(makeOrder({ status: "preparing" }))

      await expect(deliverOrder("tenant-1", "order-1")).rejects.toThrow(
        "Invalid transition: preparing → delivered"
      )
    })
  })

  describe("full lifecycle", () => {
    it("pending → confirmed → preparing → ready → delivered", async () => {
      mockOrders.push(makeOrder({ status: "pending" }))

      await confirmOrder("tenant-1", "order-1")
      expect(mockOrders[0].status).toBe("confirmed")

      await prepareOrder("tenant-1", "order-1")
      expect(mockOrders[0].status).toBe("preparing")

      await markReady("tenant-1", "order-1")
      expect(mockOrders[0].status).toBe("ready")

      await deliverOrder("tenant-1", "order-1")
      expect(mockOrders[0].status).toBe("delivered")
    })

    it("pending → confirmed → preparing → ready (delivery stops here)", async () => {
      mockOrders.push(makeOrder({ status: "pending", source: "delivery" }))

      await confirmOrder("tenant-1", "order-1")
      await prepareOrder("tenant-1", "order-1")
      await markReady("tenant-1", "order-1")

      expect(mockOrders[0].status).toBe("ready")

      // delivery → delivered is managed by SaaS, not POS
      await deliverOrder("tenant-1", "order-1")
      expect(mockOrders[0].status).toBe("delivered")
    })
  })

  describe("cancel from any active state", () => {
    it("cancels from preparing", async () => {
      mockOrders.push(makeOrder({ status: "preparing" }))

      await cancelOrder("tenant-1", "order-1")
      expect(mockOrders[0].status).toBe("cancelled")
    })

    it("cancels from ready", async () => {
      mockOrders.push(makeOrder({ status: "ready" }))

      await cancelOrder("tenant-1", "order-1")
      expect(mockOrders[0].status).toBe("cancelled")
    })

    it("rejects cancel from delivered", async () => {
      mockOrders.push(makeOrder({ status: "delivered" }))

      await expect(cancelOrder("tenant-1", "order-1")).rejects.toThrow(
        "Invalid transition"
      )
    })
  })
})
