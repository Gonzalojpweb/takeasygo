import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock Dexie before importing counter-sale ─────────────────────
interface FakeMovement {
  id: string
  type: string
  amount: number
  reason: string
  userId: string
  timestamp: Date
  relatedOrderId?: string
  channel: string
  paymentMethod: string
}
interface FakeRegister {
  id: string
  tenantId: string
  status: string
  defaultForChannel: string | null
  movements: FakeMovement[]
}
interface FakePending {
  id: string
  tenantId: string
  type: string
  amount: number
  reason: string
  userId: string
  timestamp: Date
  relatedOrderId?: string
  channel: string
  paymentMethod: string
  source: string
  createdAt: Date
}
const mockRegisters: FakeRegister[] = []
const mockPending: FakePending[] = []

vi.mock("../db/dexie", () => ({
  db: {
    cashRegister: {
      where: () => ({
        equals: () => ({
          toArray: () => Promise.resolve(mockRegisters),
        }),
      }),
      get: (id: string) => Promise.resolve(mockRegisters.find((r) => r.id === id)),
      put: (reg: FakeRegister) => {
        const idx = mockRegisters.findIndex((r) => r.id === reg.id)
        if (idx >= 0) mockRegisters[idx] = reg
        else mockRegisters.push(reg)
        return Promise.resolve(reg.id)
      },
    },
    pendingMovements: {
      add: (item: FakePending) => {
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
    const movement: FakeMovement = {
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
    const reg = mockRegisters.find((r) => r.id === registerId)
    if (reg) {
      reg.movements = [...reg.movements, movement]
    }
    return { movement, register: reg }
  }),
  getRegisterForChannel: vi.fn(async (tenantId: string, channel: string) => {
    return mockRegisters.find(
      (r) => r.tenantId === tenantId && r.status === "open" && (r.defaultForChannel === channel || r.defaultForChannel === null)
    )
  }),
}))

import { registerCounterSale } from "../services/counter-sale"
import { addMovement } from "../services/cash"

const TENANT = "tenant_1"

describe("registerCounterSale", () => {
  beforeEach(() => {
    mockRegisters.length = 0
    mockPending.length = 0
    vi.clearAllMocks()
  })

  it("registra venta en efectivo en la caja abierta del canal counter", async () => {
    mockRegisters.push({
      id: "reg_1",
      tenantId: TENANT,
      status: "open",
      defaultForChannel: "counter",
      movements: [],
    })

    const result = await registerCounterSale({
      tenantId: TENANT,
      amount: 4500,
      paymentMethod: "cash",
      reason: "Pedido M5",
      relatedOrderId: "ord_1",
    })

    expect(result.status).toBe("registered")
    if (result.status === "registered") {
      expect(result.movementId).toBeDefined()
    }
    expect(addMovement).toHaveBeenCalledWith(
      TENANT,
      "reg_1",
      "sale",
      4500,
      "Pedido M5",
      "system",
      "counter",
      "cash",
      "ord_1"
    )
  })

  it("omite métodos no-efectivo: terminal no mueve cajón acá", async () => {
    mockRegisters.push({
      id: "reg_1",
      tenantId: TENANT,
      status: "open",
      defaultForChannel: "counter",
      movements: [],
    })

    const result = await registerCounterSale({
      tenantId: TENANT,
      amount: 4500,
      paymentMethod: "mercadopago",
      reason: "Pedido mostrador",
      relatedOrderId: "ord_term",
    })

    expect(result.status).toBe("skipped")
    expect(addMovement).not.toHaveBeenCalled()
    expect(mockPending.length).toBe(0)
  })

  it("sin caja abierta → encola en pendingMovements con source counter_sale", async () => {
    const result = await registerCounterSale({
      tenantId: TENANT,
      amount: 3000,
      paymentMethod: "cash",
      reason: "Pedido mostrador",
      relatedOrderId: "ord_2",
    })

    expect(result.status).toBe("pending")
    expect(mockPending.length).toBe(1)
    expect(mockPending[0]).toMatchObject({
      tenantId: TENANT,
      type: "sale",
      amount: 3000,
      relatedOrderId: "ord_2",
      channel: "counter",
      paymentMethod: "cash",
      source: "counter_sale",
    })
    expect(addMovement).not.toHaveBeenCalled()
  })

  it("detecta duplicado por relatedOrderId ya registrado en caja", async () => {
    mockRegisters.push({
      id: "reg_1",
      tenantId: TENANT,
      status: "open",
      defaultForChannel: null,
      movements: [
        {
          id: "mov_existing",
          type: "sale",
          relatedOrderId: "ord_dup",
          amount: 100,
          channel: "counter",
          paymentMethod: "cash",
        },
      ],
    })

    const result = await registerCounterSale({
      tenantId: TENANT,
      amount: 100,
      paymentMethod: "cash",
      reason: "Pedido M5",
      relatedOrderId: "ord_dup",
    })

    expect(result.status).toBe("duplicate")
    if (result.status === "duplicate") {
      expect(result.existingMovementId).toBe("mov_existing")
    }
    expect(addMovement).not.toHaveBeenCalled()
  })

  it("si ya está encolado → devuelve el pendiente sin duplicar la cola", async () => {
    mockPending.push({
      id: "pend_1",
      tenantId: TENANT,
      relatedOrderId: "ord_queued",
      type: "sale",
      amount: 500,
      channel: "counter",
      paymentMethod: "cash",
      source: "counter_sale",
      createdAt: new Date(),
    })

    const result = await registerCounterSale({
      tenantId: TENANT,
      amount: 500,
      paymentMethod: "cash",
      reason: "Pedido M5",
      relatedOrderId: "ord_queued",
    })

    expect(result.status).toBe("pending")
    if (result.status === "pending") {
      expect(result.pendingId).toBe("pend_1")
    }
    expect(mockPending.length).toBe(1)
    expect(addMovement).not.toHaveBeenCalled()
  })

  it("si el server rechaza → encola el pendiente y NO lanza (la venta ya sucedió)", async () => {
    mockRegisters.push({
      id: "reg_1",
      tenantId: TENANT,
      status: "open",
      defaultForChannel: "counter",
      movements: [],
    })
    vi.mocked(addMovement).mockRejectedValueOnce(new Error("server down"))

    const result = await registerCounterSale({
      tenantId: TENANT,
      amount: 2000,
      paymentMethod: "cash",
      reason: "Pedido M5",
      relatedOrderId: "ord_fail",
    })

    expect(result.status).toBe("pending")
    expect(mockPending.length).toBe(1)
    expect(mockPending[0].relatedOrderId).toBe("ord_fail")
  })

  it("cobros parciales: relatedOrderId con sufijo #n registra cada parte", async () => {
    mockRegisters.push({
      id: "reg_1",
      tenantId: TENANT,
      status: "open",
      defaultForChannel: "counter",
      movements: [],
    })

    const part1 = await registerCounterSale({
      tenantId: TENANT,
      amount: 1500,
      paymentMethod: "cash",
      reason: "Pedido M5 (parte 1/2)",
      relatedOrderId: "ord_split#0",
    })
    const part2 = await registerCounterSale({
      tenantId: TENANT,
      amount: 1500,
      paymentMethod: "cash",
      reason: "Pedido M5 (parte 2/2)",
      relatedOrderId: "ord_split#1",
    })

    expect(part1.status).toBe("registered")
    expect(part2.status).toBe("registered")
    expect(mockRegisters[0].movements.length).toBe(2)
  })

  it("monto no positivo → lanza (el server lo rechazaría igual)", async () => {
    await expect(
      registerCounterSale({
        tenantId: TENANT,
        amount: 0,
        paymentMethod: "cash",
        reason: "Pedido M5",
        relatedOrderId: "ord_zero",
      })
    ).rejects.toThrow("El monto debe ser positivo")
  })
})
