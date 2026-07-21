import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock Dexie ────────────────────────────────────────────────────
const mockOrders: any[] = []
const mockPendingStatusUpdates: any[] = []

// Track transaction calls for verification
let transactionCalled = false

vi.mock("../db/dexie", () => ({
  db: {
    orders: {
      get: (id: string) => Promise.resolve(mockOrders.find((o) => o.id === id)),
      add: (order: any) => {
        const exists = mockOrders.some((o) => o.id === order.id)
        if (exists) {
          return Promise.reject(new Error(`Key already exists in the object store`))
        }
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
      where: (field: string) => ({
        equals: (value: any) => ({
          and: (fn: any) => ({
            toArray: () => Promise.resolve(mockOrders.filter((o) => o[field] === value && fn(o))),
          }),
          toArray: () => Promise.resolve(mockOrders.filter((o) => o[field] === value)),
        }),
      }),
    },
    pendingStatusUpdates: {
      get: (orderId: string) =>
        Promise.resolve(mockPendingStatusUpdates.find((p) => p.orderId === orderId)),
      put: (record: any) => {
        const idx = mockPendingStatusUpdates.findIndex((p) => p.orderId === record.orderId)
        if (idx >= 0) {
          mockPendingStatusUpdates[idx] = { ...record }
        } else {
          mockPendingStatusUpdates.push({ ...record })
        }
        return Promise.resolve(record.orderId)
      },
      delete: (orderId: string) => {
        const idx = mockPendingStatusUpdates.findIndex((p) => p.orderId === orderId)
        if (idx >= 0) mockPendingStatusUpdates.splice(idx, 1)
        return Promise.resolve()
      },
      bulkDelete: (orderIds: string[]) => {
        for (const id of orderIds) {
          const idx = mockPendingStatusUpdates.findIndex((p) => p.orderId === id)
          if (idx >= 0) mockPendingStatusUpdates.splice(idx, 1)
        }
        return Promise.resolve()
      },
      where: (field: string) => ({
        below: (cutoff: any) => ({
          toArray: () =>
            Promise.resolve(
              mockPendingStatusUpdates.filter((r) => r[field] < cutoff)
            ),
        }),
      }),
    },
    transaction: (_mode: string, _tables: any[], callback: () => Promise<void>) => {
      transactionCalled = true
      return callback()
    },
  },
}))

// Mock cleanup to prevent side effects during import
vi.mock("../services/external-orders", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("../services/external-orders")
  return {
    ...actual,
    cleanupPendingStatusUpdates: vi.fn(async () => 0),
  }
})

import {
  persistExternalOrder,
  transformExternalOrder,
  updateExternalOrderStatus,
  cancelExternalOrder,
} from "../services/external-orders"

beforeEach(() => {
  mockOrders.length = 0
  mockPendingStatusUpdates.length = 0
  transactionCalled = false
})

// ── Test data ─────────────────────────────────────────────────────
const BASE_ORDER = {
  orderId: "sync_order_abc123",
  tenantId: "tenant_test",
  items: [
    { productId: "p1", name: "Hamburguesa", quantity: 2, unitPrice: 1500, total: 3000 },
  ],
  total: 3000,
}

// ============================================================================
// persistExternalOrder — Idempotencia
// ============================================================================

describe("persistExternalOrder", () => {
  it("creates a new record on first call", async () => {
    const id = await persistExternalOrder(BASE_ORDER)

    expect(id).toBe("sync_order_abc123")
    expect(mockOrders).toHaveLength(1)
    expect(mockOrders[0].id).toBe("sync_order_abc123")
    expect(mockOrders[0].source).toBe("external")
    expect(mockOrders[0].externalOrderId).toBe("sync_order_abc123")
    expect(mockOrders[0].paymentSource).toBe("external_prepaid")
    expect(mockOrders[0].externalStatus).toBe("awaiting_payment")
  })

  it("does NOT duplicate on second call with same orderId (idempotency)", async () => {
    await persistExternalOrder(BASE_ORDER)
    await persistExternalOrder(BASE_ORDER)

    expect(mockOrders).toHaveLength(1)
    expect(mockOrders[0].id).toBe("sync_order_abc123")
  })

  it("updates externalStatus on re-call instead of creating a new record", async () => {
    await persistExternalOrder(BASE_ORDER)
    expect(mockOrders[0].externalStatus).toBe("awaiting_payment")

    await persistExternalOrder({
      ...BASE_ORDER,
      externalStatus: "confirmed",
    })

    expect(mockOrders).toHaveLength(1)
    expect(mockOrders[0].externalStatus).toBe("confirmed")
  })

  it("preserves existing status when re-called with 'pending'", async () => {
    await persistExternalOrder(BASE_ORDER)
    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "confirmed")
    expect(mockOrders[0].status).toBe("pending")
    expect(mockOrders[0].externalStatus).toBe("confirmed")

    await persistExternalOrder({
      ...BASE_ORDER,
      status: "pending",
      externalStatus: "confirmed",
    })

    expect(mockOrders).toHaveLength(1)
    expect(mockOrders[0].externalStatus).toBe("confirmed")
  })

  it("does NOT overwrite externalStatus when not provided on re-call", async () => {
    await persistExternalOrder(BASE_ORDER)
    // Simulate socket confirming (updates externalStatus)
    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "confirmed")
    expect(mockOrders[0].externalStatus).toBe("confirmed")

    // Re-call without externalStatus — should NOT revert to awaiting_payment
    await persistExternalOrder({
      ...BASE_ORDER,
      // externalStatus omitted → should not overwrite
    })

    expect(mockOrders).toHaveLength(1)
    expect(mockOrders[0].externalStatus).toBe("confirmed")
  })

  it("sets paymentSource to 'external_prepaid' on first insert", async () => {
    await persistExternalOrder(BASE_ORDER)

    expect(mockOrders[0].paymentSource).toBe("external_prepaid")
    expect(mockOrders[0].paymentMethod).toBeUndefined()
  })

  it("uses transaction for create + pending cleanup", async () => {
    await persistExternalOrder(BASE_ORDER)

    expect(transactionCalled).toBe(true)
  })

  it("does NOT revert externalStatus backward (monotony guard on re-persist)", async () => {
    await persistExternalOrder(BASE_ORDER)
    // Advance externalStatus via socket
    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "ready")
    expect(mockOrders[0].externalStatus).toBe("ready")

    // Re-persist with stale confirmed status (simulates reconnect with old SyncLayer data)
    await persistExternalOrder({
      ...BASE_ORDER,
      externalStatus: "confirmed",
    })

    // Should NOT revert — ready is ahead of confirmed
    expect(mockOrders[0].externalStatus).toBe("ready")
  })
})

// ============================================================================
// persistExternalOrder — Out-of-order (Decisión Cristóbal)
// ============================================================================

describe("persistExternalOrder — out-of-order", () => {
  it("applies pending status_update when order:created arrives AFTER status_updated", async () => {
    // 1. order:status_updated(confirmed) arrives FIRST
    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "confirmed")
    expect(mockPendingStatusUpdates).toHaveLength(1)
    expect(mockPendingStatusUpdates[0].externalStatus).toBe("confirmed")
    expect(mockOrders).toHaveLength(0) // no order yet

    // 2. order:created arrives LATER
    await persistExternalOrder(BASE_ORDER)

    // Record created with confirmed status, not awaiting_payment
    expect(mockOrders).toHaveLength(1)
    expect(mockOrders[0].externalStatus).toBe("confirmed")
    expect(mockOrders[0].id).toBe("sync_order_abc123")

    // Pending cleaned up
    expect(mockPendingStatusUpdates).toHaveLength(0)
  })

  it("last-write-wins: two status_updates before order:created → keeps most recent", async () => {
    // 1. order:status_updated(confirmed) arrives
    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "confirmed")

    // 2. order:status_updated(preparing) arrives — overwrites confirmed
    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "preparing")

    // Only one pending record (upsert)
    expect(mockPendingStatusUpdates).toHaveLength(1)
    expect(mockPendingStatusUpdates[0].externalStatus).toBe("preparing")

    // 3. order:created arrives
    await persistExternalOrder(BASE_ORDER)

    expect(mockOrders).toHaveLength(1)
    expect(mockOrders[0].externalStatus).toBe("preparing") // last write wins
    expect(mockPendingStatusUpdates).toHaveLength(0)
  })

  it("applies pending cancel when order:cancelled arrives BEFORE order:created", async () => {
    // 1. order:cancelled arrives FIRST
    await cancelExternalOrder("sync_order_abc123", "tenant_test", "offline_timeout")
    expect(mockPendingStatusUpdates).toHaveLength(1)
    expect(mockPendingStatusUpdates[0].type).toBe("cancel")
    expect(mockPendingStatusUpdates[0].cancelReason).toBe("offline_timeout")

    // 2. order:created arrives LATER
    await persistExternalOrder(BASE_ORDER)

    // Record created directly as cancelled
    expect(mockOrders).toHaveLength(1)
    expect(mockOrders[0].status).toBe("cancelled")
    expect(mockOrders[0].externalStatus).toBe("cancelled")
    expect(mockOrders[0].notes).toContain("[Cancelado: offline_timeout]")
    expect(mockPendingStatusUpdates).toHaveLength(0)
  })

  it("does NOT apply pending if order already exists (event arrived after creation)", async () => {
    // 1. order:created arrives first (normal case)
    await persistExternalOrder(BASE_ORDER)
    expect(mockOrders[0].externalStatus).toBe("awaiting_payment")

    // 2. order:status_updated arrives — updates in-place directly
    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "confirmed")
    expect(mockOrders[0].externalStatus).toBe("confirmed")
    expect(mockPendingStatusUpdates).toHaveLength(0) // no pending needed
  })
})

// ============================================================================
// transformExternalOrder — Update in-place
// ============================================================================

describe("transformExternalOrder", () => {
  it("updates the SAME record, does NOT create a new one", async () => {
    await persistExternalOrder(BASE_ORDER)
    expect(mockOrders).toHaveLength(1)

    const updated = await transformExternalOrder({
      orderId: "sync_order_abc123",
      tenantId: "tenant_test",
      items: [
        { productId: "p1", name: "Hamburguesa", quantity: 2, unitPrice: 1500, total: 3000 },
        { productId: "p2", name: "Papas fritas", quantity: 1, unitPrice: 800, total: 800 },
      ],
      total: 3800,
    })

    expect(mockOrders).toHaveLength(1)
    expect(updated.id).toBe("sync_order_abc123")
    expect(updated.items).toHaveLength(2)
    expect(updated.total).toBe(3800)
    expect(updated.integratedAt).toBeDefined()
    expect(updated.integratedBy).toBe("cashier")
    expect(updated.source).toBe("external")
    expect(updated.externalOrderId).toBe("sync_order_abc123")
    expect(updated.paymentSource).toBe("external_prepaid")
  })

  it("throws if order does not exist", async () => {
    await expect(
      transformExternalOrder({
        orderId: "nonexistent",
        tenantId: "tenant_test",
        items: [],
        total: 0,
      })
    ).rejects.toThrow("not found")
  })

  it("throws on tenant mismatch", async () => {
    await persistExternalOrder(BASE_ORDER)

    await expect(
      transformExternalOrder({
        orderId: "sync_order_abc123",
        tenantId: "wrong_tenant",
        items: [],
        total: 0,
      })
    ).rejects.toThrow("Tenant mismatch")
  })
})

// ============================================================================
// cancelExternalOrder — Updates in-place, does NOT delete
// ============================================================================

describe("cancelExternalOrder", () => {
  it("marks status as 'cancelled' WITHOUT deleting the record", async () => {
    await persistExternalOrder(BASE_ORDER)
    expect(mockOrders).toHaveLength(1)

    await cancelExternalOrder("sync_order_abc123", "tenant_test", "offline_timeout")

    expect(mockOrders).toHaveLength(1)
    expect(mockOrders[0].status).toBe("cancelled")
    expect(mockOrders[0].notes).toContain("[Cancelado: offline_timeout]")
  })

  it("preserves existing notes when cancelling without reason", async () => {
    await persistExternalOrder({
      ...BASE_ORDER,
      notes: "Sin cebolla",
    })

    await cancelExternalOrder("sync_order_abc123", "tenant_test")

    expect(mockOrders[0].notes).toBe("Sin cebolla")
  })

  it("appends cancel reason to existing notes", async () => {
    await persistExternalOrder({
      ...BASE_ORDER,
      notes: "Sin cebolla",
    })

    await cancelExternalOrder("sync_order_abc123", "tenant_test", "offline_timeout")

    expect(mockOrders[0].notes).toBe("Sin cebolla [Cancelado: offline_timeout]")
  })

  it("does nothing if order does not exist — writes to pending instead", async () => {
    await cancelExternalOrder("nonexistent", "tenant_test", "timeout")
    // Out-of-order: writes to pending instead of silently dropping
    expect(mockPendingStatusUpdates).toHaveLength(1)
    expect(mockPendingStatusUpdates[0].type).toBe("cancel")
  })

  it("does nothing on tenant mismatch", async () => {
    await persistExternalOrder(BASE_ORDER)
    await cancelExternalOrder("sync_order_abc123", "wrong_tenant")

    expect(mockOrders[0].status).toBe("pending")
  })
})

// ============================================================================
// updateExternalOrderStatus
// ============================================================================

describe("updateExternalOrderStatus", () => {
  it("updates externalStatus without changing internal status", async () => {
    await persistExternalOrder(BASE_ORDER)
    expect(mockOrders[0].status).toBe("pending")
    expect(mockOrders[0].externalStatus).toBe("awaiting_payment")

    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "confirmed")

    expect(mockOrders[0].status).toBe("pending")
    expect(mockOrders[0].externalStatus).toBe("confirmed")
  })

  it("does nothing if order does not exist — writes to pending instead", async () => {
    await updateExternalOrderStatus("nonexistent", "tenant_test", "confirmed")
    // Out-of-order: writes to pending instead of silently dropping
    expect(mockPendingStatusUpdates).toHaveLength(1)
    expect(mockPendingStatusUpdates[0].type).toBe("status_update")
    expect(mockPendingStatusUpdates[0].externalStatus).toBe("confirmed")
  })

  it("mirrors delivered externalStatus to local status — removes from IncomingOrders filter", async () => {
    // Delivery order, cashier advanced to 'ready' via POS button
    await persistExternalOrder(BASE_ORDER)
    mockOrders[0].status = "ready"
    mockOrders[0].source = "delivery"

    // SaaS delivery driver marks as delivered
    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "delivered")

    // Both local status AND externalStatus should be "delivered"
    expect(mockOrders[0].status).toBe("delivered")
    expect(mockOrders[0].externalStatus).toBe("delivered")

    // This order would now fail the IncomingOrdersDashboard filter (status !== 'delivered')
    const passesFilter = mockOrders[0].status !== "delivered"
    expect(passesFilter).toBe(false)
  })

  it("mirrors cancelled externalStatus to local status — pre-integration cancel", async () => {
    // Order arrived from TakeasyGO, is in awaiting_payment, NOT yet integrated
    await persistExternalOrder(BASE_ORDER)
    expect(mockOrders[0].status).toBe("pending")
    expect(mockOrders[0].externalStatus).toBe("awaiting_payment")

    // Admin cancels from SaaS panel
    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "cancelled")

    // Both local status AND externalStatus should be "cancelled"
    expect(mockOrders[0].status).toBe("cancelled")
    expect(mockOrders[0].externalStatus).toBe("cancelled")

    // This order would now fail the IncomingOrdersDashboard filter (status !== 'cancelled')
    const passesFilter = mockOrders[0].status !== "cancelled"
    expect(passesFilter).toBe(false)
  })

  it("does NOT mirror intermediate statuses to local status", async () => {
    await persistExternalOrder(BASE_ORDER)
    mockOrders[0].status = "preparing"

    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "en_ruta")

    // externalStatus updated, but local status should NOT change
    expect(mockOrders[0].externalStatus).toBe("en_ruta")
    expect(mockOrders[0].status).toBe("preparing")
  })

  // ── Monotonía: stale event guard ─────────────────────────────────

  it("rejects stale event — preparing cannot overwrite ready in externalStatus", async () => {
    await persistExternalOrder(BASE_ORDER)
    // SaaS progressed to ready
    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "ready")
    expect(mockOrders[0].externalStatus).toBe("ready")

    // Late retry of preparing arrives (stale)
    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "preparing")

    // Should NOT overwrite — ready is ahead of preparing
    expect(mockOrders[0].externalStatus).toBe("ready")
  })

  it("rejects stale event — confirmed cannot overwrite ready in externalStatus", async () => {
    await persistExternalOrder(BASE_ORDER)
    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "ready")

    // Late confirmed arrives
    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "confirmed")

    expect(mockOrders[0].externalStatus).toBe("ready")
  })

  it("accepts forward event — confirmed → preparing (monotonic advance)", async () => {
    await persistExternalOrder(BASE_ORDER)
    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "confirmed")
    expect(mockOrders[0].externalStatus).toBe("confirmed")

    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "preparing")
    expect(mockOrders[0].externalStatus).toBe("preparing")
  })

  it("terminal state always applies — delivered overwrites any externalStatus", async () => {
    await persistExternalOrder(BASE_ORDER)
    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "ready")
    expect(mockOrders[0].externalStatus).toBe("ready")

    // delivered is terminal — always applies regardless of order
    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "delivered")
    expect(mockOrders[0].externalStatus).toBe("delivered")
    expect(mockOrders[0].status).toBe("delivered")
  })

  it("terminal state always applies — cancelled overwrites any externalStatus", async () => {
    await persistExternalOrder(BASE_ORDER)
    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "ready")

    // cancelled is terminal — always applies
    await updateExternalOrderStatus("sync_order_abc123", "tenant_test", "cancelled")
    expect(mockOrders[0].externalStatus).toBe("cancelled")
    expect(mockOrders[0].status).toBe("cancelled")
  })
})
