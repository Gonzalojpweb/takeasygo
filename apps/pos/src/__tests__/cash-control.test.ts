import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  ARS_BILL_DENOMINATIONS,
  canSeeExpectedCash,
  generateZReport,
  movementRequiresApproval,
  movementRequiresCategory,
  sumDenominations,
} from "@takeasygo/business/browser"
import type { CashMovement, CashRegister } from "@takeasygo/types"

import { posApi, SESSION_CACHE_KEY } from "../services/pos-api"
import { answerApproval, subscribeApproval, type ApprovalPrompt } from "../services/manager-approval"

/**
 * Fase 1 de caja (2026-10) — lado POS.
 * Docs: ADMIN/FASE1_CAJA_PROFESIONAL.md.
 */

vi.mock("../db/dexie", () => ({
  db: { tenantConfig: { get: vi.fn().mockResolvedValue({ locationId: "loc-1" }) } },
}))

describe("reglas de control de caja", () => {
  it("suma el conteo por billete más las monedas", () => {
    expect(sumDenominations([{ value: 1_000_000, count: 2 }, { value: 50_000, count: 3 }], 1_250)).toBe(2_151_250)
  })

  it("rechaza billetes inexistentes, repetidos o cantidades negativas", () => {
    expect(() => sumDenominations([{ value: 123, count: 1 }])).toThrow()
    expect(() => sumDenominations([{ value: 100_000, count: 1 }, { value: 100_000, count: 1 }])).toThrow()
    expect(() => sumDenominations([{ value: 100_000, count: -1 }])).toThrow()
  })

  it("las denominaciones van de mayor a menor", () => {
    expect([...ARS_BILL_DENOMINATIONS].sort((a, b) => b - a)).toEqual(ARS_BILL_DENOMINATIONS)
  })

  it("solo encargado y admin ven el saldo esperado (cierre ciego)", () => {
    expect(canSeeExpectedCash("manager")).toBe(true)
    expect(canSeeExpectedCash("admin")).toBe(true)
    expect(canSeeExpectedCash("cashier")).toBe(false)
    expect(canSeeExpectedCash(undefined)).toBe(false)
  })

  it("gastos y retiros llevan categoría; solo el retiro pide aprobación", () => {
    expect(movementRequiresCategory("expense")).toBe(true)
    expect(movementRequiresCategory("withdrawal")).toBe(true)
    expect(movementRequiresCategory("income")).toBe(false)
    expect(movementRequiresApproval("withdrawal")).toBe(true)
    expect(movementRequiresApproval("expense")).toBe(false)
  })

  it("el Z agrupa egresos por categoría, retiros y ventas anuladas", () => {
    const base = { userId: "u", timestamp: new Date(), channel: "counter" as const }
    const movements: CashMovement[] = [
      { ...base, id: "1", type: "sale", amount: 1000, reason: "", paymentMethod: "cash", relatedOrderId: "o1#0" },
      { ...base, id: "2", type: "sale", amount: 2000, reason: "", paymentMethod: "mercadopago", relatedOrderId: "o1#1" },
      { ...base, id: "3", type: "refund", amount: 1000, reason: "", paymentMethod: "cash", relatedOrderId: "o1#0", source: "void" },
      { ...base, id: "4", type: "refund", amount: 2000, reason: "", paymentMethod: "mercadopago", relatedOrderId: "o1#1", source: "void" },
      { ...base, id: "5", type: "expense", amount: 500, reason: "", paymentMethod: "cash", category: "suppliers" },
      { ...base, id: "6", type: "withdrawal", amount: 700, reason: "", paymentMethod: "cash", category: "owner_withdrawal" },
    ]
    const register: CashRegister = {
      id: "r", tenantId: "t", openedBy: "x", openedAt: new Date(), initialAmount: 0,
      movements, status: "closed", defaultForChannel: null,
      closingCount: { bills: [], coins: 0, total: 0 },
    }
    const z = generateZReport({ register, movements, closedBy: "x" })
    expect(z.byCategory).toEqual({ suppliers: 500, owner_withdrawal: 700 })
    expect(z.withdrawalTotal).toBe(700)
    expect(z.voidCount).toBe(1)
    expect(z.closingCount).toEqual({ bills: [], coins: 0, total: 0 })
  })
})

describe("posApi — aprobación de encargado", () => {
  const fetchMock = vi.fn()
  let prompts: (ApprovalPrompt | null)[] = []
  let unsubscribe: () => void

  function json(body: unknown, status: number): Response {
    return { ok: status < 300, status, json: async () => body } as unknown as Response
  }

  beforeEach(() => {
    import.meta.env.VITE_SAAS_URL = "http://saas.test"
    const store = new Map([[SESSION_CACHE_KEY, JSON.stringify({ accessToken: "jwt" })]])
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: vi.fn(), removeItem: vi.fn() })
    vi.stubGlobal("window", { dispatchEvent: vi.fn() })
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockReset()
    prompts = []
    unsubscribe = subscribeApproval((p) => {
      prompts.push(p)
      if (p) queueMicrotask(() => answerApproval(p.error ? "482913" : "000000"))
    })
  })

  afterEach(() => {
    unsubscribe()
    vi.unstubAllGlobals()
  })

  it("pide el PIN, reintenta con X-Manager-Pin y vuelve a pedirlo si es incorrecto", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ error: { code: "approval_required", message: "Un retiro necesita encargado" } }, 403))
      .mockResolvedValueOnce(json({ error: { code: "approval_invalid", message: "PIN de encargado incorrecto" } }, 403))
      .mockResolvedValueOnce(json({ ok: true }, 201))

    const result = await posApi<{ ok: boolean }>("t", "/cash/registers/r/movements", { method: "POST", body: {} })
    expect(result.ok).toBe(true)

    const pins = fetchMock.mock.calls.map(([, init]) => (init as RequestInit).headers as Record<string, string>)
    expect(pins[0]["X-Manager-Pin"]).toBeUndefined()
    expect(pins[1]["X-Manager-Pin"]).toBe("000000")
    expect(pins[2]["X-Manager-Pin"]).toBe("482913")

    const shown = prompts.filter(Boolean) as ApprovalPrompt[]
    expect(shown[0]).toEqual({ message: "Un retiro necesita encargado", error: null })
    expect(shown[1]).toEqual({ message: "Un retiro necesita encargado", error: "PIN de encargado incorrecto" })
  })

  it("si se cancela el PIN, la operación falla con approval_cancelled", async () => {
    unsubscribe()
    unsubscribe = subscribeApproval((p) => {
      if (p) queueMicrotask(() => answerApproval(null))
    })
    fetchMock.mockResolvedValueOnce(json({ error: { code: "approval_required", message: "x" } }, 403))
    await expect(posApi("t", "/orders/o/void", { method: "POST", body: {} })).rejects.toMatchObject({
      code: "approval_cancelled",
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
