import { describe, it, expect } from "vitest"
import {
  generateZReport,
  isTipMovement,
  isTipValid,
  suggestedTipCents,
  tipRelatedOrderId,
  TIP_METHODS,
} from "@takeasygo/business/browser"
import type { CashMovement, CashRegister } from "@takeasygo/types"
import { cashToCollect } from "../components/shared/CheckoutPanel"

// Piloto 06/11: propinas. No son venta: ingreso de caja aparte, marcado
// `<orden>:tip`, fuera del total de la orden y de la factura.

const register: CashRegister = {
  id: "reg_1",
  tenantId: "t1",
  openedBy: "admin",
  openedAt: new Date(),
  initialAmount: 0,
  movements: [],
  status: "closed",
  defaultForChannel: null,
}

function mv(overrides: Partial<CashMovement>): CashMovement {
  return {
    id: crypto.randomUUID(),
    type: "sale",
    amount: 100_00,
    reason: "Pedido M1",
    userId: "u",
    timestamp: new Date(),
    channel: "counter",
    paymentMethod: "cash",
    ...overrides,
  }
}

describe("propina sugerida", () => {
  it("redondea a $100 hacia arriba", () => {
    expect(suggestedTipCents(12_345_00, 10)).toBe(1_300_00)
    expect(suggestedTipCents(10_000_00, 10)).toBe(1_000_00)
  })

  it("sin total no sugiere", () => {
    expect(suggestedTipCents(0, 10)).toBe(0)
  })
})

describe("validación", () => {
  it("sin propina es válido", () => {
    expect(isTipValid(null, 1_000_00)).toBe(true)
  })

  it("no puede superar el total ni ser cero o fraccionaria", () => {
    expect(isTipValid({ amount: 1_000_01, method: "cash" }, 1_000_00)).toBe(false)
    expect(isTipValid({ amount: 0, method: "cash" }, 1_000_00)).toBe(false)
    expect(isTipValid({ amount: 10.5, method: "cash" }, 1_000_00)).toBe(false)
  })

  it("Mercado Pago no es método de propina (no se toca el flujo de MP)", () => {
    expect(TIP_METHODS).not.toContain("mercadopago")
    expect(isTipValid({ amount: 100_00, method: "mercadopago" }, 1_000_00)).toBe(false)
  })
})

describe("caja y Z", () => {
  it("la marca identifica solo ingresos de propina", () => {
    expect(isTipMovement({ type: "income", relatedOrderId: tipRelatedOrderId("o1") })).toBe(true)
    expect(isTipMovement({ type: "sale", relatedOrderId: tipRelatedOrderId("o1") })).toBe(false)
    expect(isTipMovement({ type: "income", relatedOrderId: "o1" })).toBe(false)
  })

  it("el Z muestra las propinas aparte y no las cuenta como ventas", () => {
    const z = generateZReport({
      register,
      closedBy: "admin",
      movements: [
        mv({ type: "sale", amount: 10_000_00, relatedOrderId: "o1" }),
        mv({ type: "income", amount: 1_000_00, relatedOrderId: tipRelatedOrderId("o1"), reason: "Propina M1" }),
        mv({ type: "income", amount: 500_00, relatedOrderId: tipRelatedOrderId("o2"), paymentMethod: "posnet_debit" }),
        mv({ type: "income", amount: 300_00, reason: "Fondo extra" }),
      ],
    })
    expect(z.salesTotal).toBe(10_000_00)
    expect(z.tipTotal).toBe(1_500_00)
    expect(z.incomeTotal).toBe(11_800_00)
  })
})

describe("efectivo a cobrar en el cobro", () => {
  const parts = [
    { id: "a", method: "cash" as const, amount: 8_000_00 },
    { id: "b", method: "posnet_debit" as const, amount: 2_000_00 },
  ]

  it("suma la propina en efectivo para el vuelto", () => {
    expect(cashToCollect(parts, { amount: 1_000_00, method: "cash" })).toBe(9_000_00)
  })

  it("una propina con tarjeta no cambia el efectivo", () => {
    expect(cashToCollect(parts, { amount: 1_000_00, method: "posnet_debit" })).toBe(8_000_00)
    expect(cashToCollect(parts, null)).toBe(8_000_00)
  })
})
