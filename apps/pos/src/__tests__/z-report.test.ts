import { describe, it, expect } from "vitest"
import { generateZReport } from "../services/z-report"
import type { CashRegister, CashMovement, PaymentMethod, CashChannel } from "@takeasygo/types"

function makeMovement(overrides: Partial<CashMovement> & { paymentMethod: PaymentMethod; channel: CashChannel }): CashMovement {
  return {
    id: crypto.randomUUID(),
    type: "sale",
    amount: 100,
    reason: "Test",
    userId: "user1",
    timestamp: new Date(),
    ...overrides,
  }
}

function makeRegister(overrides: Partial<CashRegister> = {}): CashRegister {
  return {
    id: "reg_1",
    tenantId: "tenant_1",
    openedBy: "admin",
    openedAt: new Date(),
    initialAmount: 10000,
    movements: [],
    status: "closed",
    defaultForChannel: null,
    ...overrides,
  }
}

describe("generateZReport", () => {
  it("genera reporte vacío correctamente", () => {
    const register = makeRegister()
    const z = generateZReport({ register, movements: [], closedBy: "admin" })

    expect(z.registerId).toBe("reg_1")
    expect(z.tenantId).toBe("tenant_1")
    expect(z.closedBy).toBe("admin")
    expect(z.initialAmount).toBe(10000)
    expect(z.totalMovements).toBe(0)
    expect(z.salesTotal).toBe(0)
    expect(z.incomeTotal).toBe(0)
    expect(z.expenseTotal).toBe(0)
    expect(z.refundTotal).toBe(0)
  })

  it("suma ventas por canal correctamente", () => {
    const movements = [
      makeMovement({ type: "sale", amount: 500, channel: "counter", paymentMethod: "cash" }),
      makeMovement({ type: "sale", amount: 300, channel: "counter", paymentMethod: "mercadopago" }),
      makeMovement({ type: "sale", amount: 700, channel: "takeasygo", paymentMethod: "mercadopago" }),
      makeMovement({ type: "sale", amount: 200, channel: "takeasygo", paymentMethod: "cash" }),
    ]

    const register = makeRegister()
    const z = generateZReport({ register, movements, closedBy: "admin" })

    expect(z.byChannel.counter.sales).toBe(800)
    expect(z.byChannel.takeasygo.sales).toBe(900)
    expect(z.salesTotal).toBe(1700)
  })

  it("suma por método de pago correctamente", () => {
    const movements = [
      makeMovement({ type: "sale", amount: 100, channel: "counter", paymentMethod: "cash" }),
      makeMovement({ type: "sale", amount: 200, channel: "counter", paymentMethod: "cash" }),
      makeMovement({ type: "sale", amount: 300, channel: "takeasygo", paymentMethod: "mercadopago" }),
      makeMovement({ type: "sale", amount: 150, channel: "counter", paymentMethod: "posnet_debit" }),
    ]

    const register = makeRegister()
    const z = generateZReport({ register, movements, closedBy: "admin" })

    expect(z.byPaymentMethod.cash).toBe(300)
    expect(z.byPaymentMethod.mercadopago).toBe(300)
    expect(z.byPaymentMethod.posnet_debit).toBe(150)
  })

  it("distingue income de expense de refund", () => {
    const movements = [
      makeMovement({ type: "income", amount: 500, channel: "counter", paymentMethod: "cash" }),
      makeMovement({ type: "expense", amount: 100, channel: "counter", paymentMethod: "cash" }),
      makeMovement({ type: "refund", amount: 50, channel: "takeasygo", paymentMethod: "mercadopago" }),
      makeMovement({ type: "deposit", amount: 200, channel: "counter", paymentMethod: "cash" }),
      makeMovement({ type: "withdrawal", amount: 300, channel: "counter", paymentMethod: "cash" }),
    ]

    const register = makeRegister()
    const z = generateZReport({ register, movements, closedBy: "admin" })

    expect(z.incomeTotal).toBe(700)   // income(500) + deposit(200)
    expect(z.expenseTotal).toBe(450)   // expense(100) + withdrawal(300) + refund(50)
    expect(z.refundTotal).toBe(50)
    expect(z.totalMovements).toBe(5)
  })

  it("usa expectedAmount del register si existe", () => {
    const register = makeRegister({ expectedAmount: 15000, difference: 500 })
    const z = generateZReport({ register, movements: [], closedBy: "admin" })

    expect(z.expectedAmount).toBe(15000)
    expect(z.difference).toBe(500)
  })

  it("usa initialAmount como expectedAmount fallback", () => {
    const register = makeRegister({ initialAmount: 10000 })
    const z = generateZReport({ register, movements: [], closedBy: "admin" })

    expect(z.expectedAmount).toBe(10000)
  })
})
