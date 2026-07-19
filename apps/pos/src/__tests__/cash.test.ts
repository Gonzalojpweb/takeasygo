import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock Dexie ────────────────────────────────────────────────────
const mockRegisters: any[] = []
const mockEnqueued: any[] = []

vi.mock("../db/dexie", () => ({
  db: {
    cashRegister: {
      where: () => ({
        equals: () => ({
          and: (fn: any) => ({
            first: () => Promise.resolve(mockRegisters.find((r) => fn(r))),
            toArray: () => Promise.resolve(mockRegisters.filter((r) => fn(r))),
          }),
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
      toArray: () => Promise.resolve([]),
    },
  },
}))

vi.mock("../services/event-queue", () => ({
  enqueue: vi.fn(async (_tenantId: string, type: string, data: any) => {
    mockEnqueued.push({ type, data })
  }),
}))

vi.mock("../services/z-report", () => ({
  generateZReport: vi.fn((input: any) => ({
    registerId: input.register.id,
    tenantId: input.register.tenantId,
    closedAt: new Date(),
    closedBy: input.closedBy,
    initialAmount: input.register.initialAmount,
    finalAmount: input.register.finalAmount ?? 0,
    expectedAmount: input.register.expectedAmount ?? input.register.initialAmount,
    difference: input.register.difference ?? 0,
    byChannel: { counter: { sales: 0, income: 0, expenses: 0, refunds: 0, movementCount: 0 }, takeasygo: { sales: 0, income: 0, expenses: 0, refunds: 0, movementCount: 0 } },
    byPaymentMethod: {},
    totalMovements: input.movements.length,
    incomeTotal: 0,
    expenseTotal: 0,
    salesTotal: 0,
    refundTotal: 0,
    generatedAt: new Date(),
  })),
}))

import { addMovement } from "../services/cash"

describe("addMovement — expectedAmount (solo cash)", () => {
  beforeEach(() => {
    mockRegisters.length = 0
    mockEnqueued.length = 0
  })

  it("sumariza efectivo al expectedAmount en income", async () => {
    mockRegisters.push({
      id: "reg_1",
      tenantId: "tenant_1",
      status: "open",
      initialAmount: 10000,
      expectedAmount: 10000,
      movements: [],
    })

    const { register } = await addMovement(
      "tenant_1", "reg_1", "income", 500, "Pago", "user1", "counter", "cash"
    )

    expect(register.expectedAmount).toBe(10500)
  })

  it("resta efectivo del expectedAmount en expense", async () => {
    mockRegisters.push({
      id: "reg_1",
      tenantId: "tenant_1",
      status: "open",
      initialAmount: 10000,
      expectedAmount: 10000,
      movements: [],
    })

    const { register } = await addMovement(
      "tenant_1", "reg_1", "expense", 200, "Proveedor", "user1", "counter", "cash"
    )

    expect(register.expectedAmount).toBe(9800)
  })

  it("NO modifica expectedAmount con mercadopago", async () => {
    mockRegisters.push({
      id: "reg_1",
      tenantId: "tenant_1",
      status: "open",
      initialAmount: 10000,
      expectedAmount: 10000,
      movements: [],
    })

    const { register } = await addMovement(
      "tenant_1", "reg_1", "sale", 3000, "Venta MP", "user1", "takeasygo", "mercadopago"
    )

    expect(register.expectedAmount).toBe(10000)
  })

  it("NO modifica expectedAmount con posnet_debit", async () => {
    mockRegisters.push({
      id: "reg_1",
      tenantId: "tenant_1",
      status: "open",
      initialAmount: 10000,
      expectedAmount: 10000,
      movements: [],
    })

    const { register } = await addMovement(
      "tenant_1", "reg_1", "sale", 1500, "Venta débito", "user1", "counter", "posnet_debit"
    )

    expect(register.expectedAmount).toBe(10000)
  })

  it("mezcla cash y mercadopago correctamente", async () => {
    mockRegisters.push({
      id: "reg_1",
      tenantId: "tenant_1",
      status: "open",
      initialAmount: 10000,
      expectedAmount: 10000,
      movements: [],
    })

    // Cash sale
    await addMovement("tenant_1", "reg_1", "sale", 2000, "Venta cash", "user1", "counter", "cash")
    // MP sale (no afecta)
    await addMovement("tenant_1", "reg_1", "sale", 3000, "Venta MP", "user1", "takeasygo", "mercadopago")
    // Cash expense
    const { register } = await addMovement("tenant_1", "reg_1", "expense", 500, "Propina", "user1", "counter", "cash")

    expect(register.expectedAmount).toBe(11500) // 10000 + 2000 - 500
  })
})

describe("addMovement — idempotencia", () => {
  beforeEach(() => {
    mockRegisters.length = 0
    mockEnqueued.length = 0
  })

  it("no duplica movimiento con mismo relatedOrderId + type", async () => {
    mockRegisters.push({
      id: "reg_1",
      tenantId: "tenant_1",
      status: "open",
      initialAmount: 10000,
      expectedAmount: 10000,
      movements: [
        {
          id: "existing_mov",
          type: "sale",
          relatedOrderId: "ord_123",
          amount: 500,
          channel: "takeasygo",
          paymentMethod: "mercadopago",
        },
      ],
    })

    const { movement } = await addMovement(
      "tenant_1", "reg_1", "sale", 500, "Duplicate", "user1", "takeasygo", "mercadopago", "ord_123"
    )

    expect(movement.id).toBe("existing_mov")
    expect(mockRegisters[0].movements.length).toBe(1)
  })

  it("permite mismo relatedOrderId con type diferente", async () => {
    mockRegisters.push({
      id: "reg_1",
      tenantId: "tenant_1",
      status: "open",
      initialAmount: 10000,
      expectedAmount: 10000,
      movements: [
        {
          id: "sale_mov",
          type: "sale",
          relatedOrderId: "ord_123",
          amount: 500,
          channel: "takeasygo",
          paymentMethod: "cash",
        },
      ],
    })

    const { movement } = await addMovement(
      "tenant_1", "reg_1", "refund", 100, "Refund", "user1", "takeasygo", "cash", "ord_123"
    )

    expect(movement.id).not.toBe("sale_mov")
    expect(mockRegisters[0].movements.length).toBe(2)
  })
})

describe("addMovement — validaciones", () => {
  beforeEach(() => {
    mockRegisters.length = 0
    mockEnqueued.length = 0
  })

  it("rechaza monto cero o negativo", async () => {
    mockRegisters.push({
      id: "reg_1",
      tenantId: "tenant_1",
      status: "open",
      initialAmount: 10000,
      movements: [],
    })

    await expect(
      addMovement("tenant_1", "reg_1", "sale", 0, "Zero", "user1", "counter", "cash")
    ).rejects.toThrow("El monto debe ser positivo")

    await expect(
      addMovement("tenant_1", "reg_1", "sale", -100, "Negative", "user1", "counter", "cash")
    ).rejects.toThrow("El monto debe ser positivo")
  })

  it("rechaza si la caja está cerrada", async () => {
    mockRegisters.push({
      id: "reg_1",
      tenantId: "tenant_1",
      status: "closed",
      initialAmount: 10000,
      movements: [],
    })

    await expect(
      addMovement("tenant_1", "reg_1", "sale", 100, "Test", "user1", "counter", "cash")
    ).rejects.toThrow("La caja está cerrada")
  })

  it("rechaza tenant mismatch", async () => {
    mockRegisters.push({
      id: "reg_1",
      tenantId: "tenant_other",
      status: "open",
      initialAmount: 10000,
      movements: [],
    })

    await expect(
      addMovement("tenant_1", "reg_1", "sale", 100, "Test", "user1", "counter", "cash")
    ).rejects.toThrow("Tenant mismatch")
  })
})
