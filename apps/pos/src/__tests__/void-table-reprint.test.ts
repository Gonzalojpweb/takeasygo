import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

import { voidSentItem, reprintComanda, releaseLocalTableIfIdle } from "../services/order"
import { voidTable } from "../services/table"
import { SESSION_CACHE_KEY } from "../services/pos-api"

/**
 * 19/11/2026 — pedido del dueño:
 *   · quitar todos los platos dejaba la mesa amarilla: la ronda vacía se
 *     cancela (server) y la mesa vuelve a libre también en el equipo;
 *   · anular la mesa entera (POST /tables/:id/void) con motivo e inventario;
 *   · reimprimir la COMANDA (POST /orders/:id/reprint), por estación.
 */

const TENANT = "64b000000000000000000001"
const LOCATION = "64b0000000000000000000f1"
const BASE = "http://saas.test"
const ORDER = "orden-uuid"
const TABLE = "mesa-uuid"
const PRODUCT = "64b0000000000000000000a1"

const fetchMock = vi.fn()
const orderPutMock = vi.hoisted(() => vi.fn())
const tablePutMock = vi.hoisted(() => vi.fn())
const tableGetMock = vi.hoisted(() => vi.fn())
const openRoundsCount = vi.hoisted(() => ({ value: 0 }))

vi.mock("../db/dexie", () => ({
  db: {
    orders: {
      put: (...args: unknown[]) => orderPutMock(...args),
      get: async () => undefined,
      where: () => ({
        equals: () => ({
          and: () => ({ toArray: async () => Array.from({ length: openRoundsCount.value }, (_, i) => ({ id: `otra-${i}` })) }),
        }),
      }),
    },
    diningTable: {
      get: (...args: unknown[]) => tableGetMock(...args),
      put: (...args: unknown[]) => tablePutMock(...args),
      update: async () => 1,
    },
    tenantConfig: { get: async () => ({ locationId: LOCATION }) },
  },
}))

vi.mock("../services/sync-api", () => ({ notifyStatusToSyncLayer: vi.fn(async () => true) }))

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
}

function lastRequest() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
  return {
    url: String(url),
    method: init.method,
    body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
  }
}

function serverOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER,
    tenantId: TENANT,
    tableId: TABLE,
    source: "pos",
    status: "confirmed",
    items: [],
    total: 0,
    menuVersion: 1,
    createdAt: "2026-11-19T12:00:00.000Z",
    updatedAt: "2026-11-19T12:00:00.000Z",
    ...overrides,
  }
}

const OCCUPIED = { id: TABLE, tenantId: TENANT, number: 5, capacity: 4, status: "occupied", currentOrderId: ORDER, guests: 2, needsBill: false }

let originalSaasUrl: string | undefined

beforeEach(() => {
  originalSaasUrl = import.meta.env.VITE_SAAS_URL
  import.meta.env.VITE_SAAS_URL = BASE
  fetchMock.mockReset()
  orderPutMock.mockReset().mockResolvedValue(ORDER)
  tablePutMock.mockReset().mockResolvedValue(TABLE)
  tableGetMock.mockReset().mockResolvedValue(OCCUPIED)
  openRoundsCount.value = 0
  const store = new Map<string, string>([[SESSION_CACHE_KEY, JSON.stringify({ accessToken: "jwt", expiresAt: 1, tenantId: TENANT })]])
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  import.meta.env.VITE_SAAS_URL = originalSaasUrl
  vi.unstubAllGlobals()
})

describe("mesa sin platos → verde", () => {
  it("si el server cancela la ronda vacía, la mesa queda libre en el equipo", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ order: serverOrder({ status: "cancelled" }) }))

    await voidSentItem(TENANT, ORDER, { productId: PRODUCT, lineId: "64b0000000000000000000c1" }, 0, "load_error")

    expect(tablePutMock).toHaveBeenCalledTimes(1)
    const freed = tablePutMock.mock.calls[0][0] as Record<string, unknown>
    expect(freed.status).toBe("free")
    expect(freed.currentOrderId).toBeUndefined()
    expect(freed.guests).toBeUndefined()
    expect(freed.needsBill).toBe(false)
  })

  it("con otra ronda abierta en la mesa, la mesa sigue ocupada", async () => {
    openRoundsCount.value = 1
    fetchMock.mockResolvedValue(jsonResponse({ order: serverOrder({ status: "cancelled" }) }))

    await voidSentItem(TENANT, ORDER, { productId: PRODUCT, lineId: "64b0000000000000000000c1" }, 0, "load_error")

    expect(tablePutMock).not.toHaveBeenCalled()
  })

  it("una ronda que sigue con platos no toca la mesa", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ order: serverOrder({ items: [{ productId: PRODUCT, name: "Pizza", quantity: 1, unitPrice: 100, total: 100 }], total: 100 }) }))

    await voidSentItem(TENANT, ORDER, { productId: PRODUCT, lineId: "64b0000000000000000000c1" }, 1, "load_error")

    expect(tablePutMock).not.toHaveBeenCalled()
  })

  it("una mesa reservada nunca se libera sola", async () => {
    tableGetMock.mockResolvedValue({ ...OCCUPIED, status: "reserved" })
    await releaseLocalTableIfIdle(TABLE)
    expect(tablePutMock).not.toHaveBeenCalled()
  })
})

describe("voidTable", () => {
  it("POST /tables/:id/void con motivo, nota e inventario; guarda rondas y mesa", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        table: { ...OCCUPIED, status: "free", currentOrderId: null },
        orders: [serverOrder({ status: "cancelled" })],
        voided: { rounds: 1, amount: 4500, wasted: true, printed: 1 },
      })
    )

    const res = await voidTable(TENANT, TABLE, { reason: "complaint", note: "  tardó 50 min  ", wasted: true })

    const req = lastRequest()
    expect(req.url).toBe(`${BASE}/api/${TENANT}/pos/tables/${TABLE}/void`)
    expect(req.method).toBe("POST")
    expect(req.body).toEqual({ reason: "complaint", note: "tardó 50 min", wasted: true })
    expect(res).toEqual({ rounds: 1, amount: 4500, wasted: true, printed: 1 })
    expect(orderPutMock).toHaveBeenCalledTimes(1)
    expect((tablePutMock.mock.calls[0][0] as { status: string }).status).toBe("free")
  })

  it("mesa sin productos: se libera sin motivo (body vacío)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ table: { ...OCCUPIED, status: "free" }, orders: [], voided: { rounds: 1, amount: 0, wasted: false, printed: 0 } }))
    await voidTable(TENANT, TABLE)
    expect(lastRequest().body).toEqual({})
  })
})

describe("reprintComanda", () => {
  it("POST /orders/:id/reprint por estación", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, jobs: 1, printers: ["Cocina"] }))
    const res = await reprintComanda(TENANT, ORDER, "kitchen")
    const req = lastRequest()
    expect(req.url).toBe(`${BASE}/api/${TENANT}/pos/orders/${ORDER}/reprint`)
    expect(req.method).toBe("POST")
    expect(req.body).toEqual({ station: "kitchen" })
    expect(res.printers).toEqual(["Cocina"])
  })

  it("sin estación: todas", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, jobs: 2, printers: ["Cocina", "Barra"] }))
    await reprintComanda(TENANT, ORDER)
    expect(lastRequest().body).toEqual({})
  })
})
