import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

import {
  confirmOrder,
  prepareOrder,
  markReady,
  deliverOrder,
  cancelOrder,
} from "../services/order"
import { PosApiError, SESSION_CACHE_KEY } from "../services/pos-api"

/**
 * M5 — services/order.ts contra /api/[tenant]/pos/orders.
 *
 * El grafo de transiciones ya NO vive en el POS: apps/saas lo valida con
 * @takeasygo/business y lo cubre apps/saas/__tests__/integration/pos-orders.test.ts
 * y pos-order-detail.test.ts. Acá protegemos el contrato del lado cliente:
 *   · cada transición es un PATCH /orders/{id} con `{status}`
 *   · server-first: Dexie recién con la respuesta del server
 *   · al cancelar/entregar, el server libera la mesa y el read local lo refleja
 *   · notifyStatusToSyncLayer sigue siendo fire-and-forget con el jwt del caller
 *   · el outbox ya no participa
 */

const TENANT = "64b000000000000000000001"
const LOCATION = "64b0000000000000000000f1"
const BASE = "http://saas.test"
const ORDER = "orden-uuid"
const TABLE = "mesa-uuid"
const JWT = "jwt-de-prueba"

const fetchMock = vi.fn()
const orderPutMock = vi.hoisted(() => vi.fn())
const orderGetMock = vi.hoisted(() => vi.fn())
const tableGetMock = vi.hoisted(() => vi.fn())
const tableUpdateMock = vi.hoisted(() => vi.fn())
const configGetMock = vi.hoisted(() => vi.fn())
const enqueueMock = vi.hoisted(() => vi.fn())
const notifyMock = vi.hoisted(() => vi.fn())

vi.mock("../db/dexie", () => ({
  db: {
    orders: {
      put: (...args: unknown[]) => orderPutMock(...args),
      get: (...args: unknown[]) => orderGetMock(...args),
      where: () => ({
        equals: () => ({
          and: () => ({ toArray: async () => [] }),
        }),
      }),
    },
    diningTable: {
      get: (...args: unknown[]) => tableGetMock(...args),
      update: (...args: unknown[]) => tableUpdateMock(...args),
    },
    tenantConfig: {
      get: (...args: unknown[]) => configGetMock(...args),
    },
  },
}))

vi.mock("../services/event-queue", () => ({
  enqueue: (...args: unknown[]) => enqueueMock(...args),
}))

vi.mock("../services/sync-api", () => ({
  notifyStatusToSyncLayer: (...args: unknown[]) => notifyMock(...args),
}))

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status)
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
    source: "pos",
    status: "pending",
    items: [
      {
        productId: "64b0000000000000000000a1",
        name: "Hamburguesa",
        quantity: 1,
        unitPrice: 500,
        total: 500,
        modifiers: [],
      },
    ],
    total: 500,
    menuVersion: 1,
    createdAt: "2026-09-27T12:00:00.000Z",
    updatedAt: "2026-09-27T12:00:00.000Z",
    ...overrides,
  }
}

let originalSaasUrl: string | undefined

beforeEach(() => {
  originalSaasUrl = import.meta.env.VITE_SAAS_URL
  import.meta.env.VITE_SAAS_URL = BASE

  fetchMock.mockReset()
  orderPutMock.mockReset()
  orderGetMock.mockReset()
  tableGetMock.mockReset()
  tableUpdateMock.mockReset()
  configGetMock.mockReset()
  enqueueMock.mockReset()
  notifyMock.mockReset()

  orderPutMock.mockResolvedValue(ORDER)
  configGetMock.mockResolvedValue({ locationId: LOCATION })
  notifyMock.mockResolvedValue(true)

  const store = new Map<string, string>()
  store.set(
    SESSION_CACHE_KEY,
    JSON.stringify({ accessToken: JWT, expiresAt: 1, tenantId: TENANT })
  )
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

describe("transiciones de estado", () => {
  const cases: Array<[string, (id: string) => Promise<void>, string]> = [
    ["confirmOrder", (id) => confirmOrder(TENANT, id), "confirmed"],
    ["prepareOrder", (id) => prepareOrder(TENANT, id), "preparing"],
    ["markReady", (id) => markReady(TENANT, id), "ready"],
    ["deliverOrder", (id) => deliverOrder(TENANT, id), "delivered"],
    ["cancelOrder", (id) => cancelOrder(TENANT, id), "cancelled"],
  ]

  for (const [name, run, status] of cases) {
    it(`${name} → PATCH /orders/[id] { status: "${status}" }`, async () => {
      fetchMock.mockResolvedValue(jsonResponse({ order: serverOrder({ status }) }))

      await run(ORDER)

      const req = lastRequest()
      expect(req.url).toBe(`${BASE}/api/${TENANT}/pos/orders/${ORDER}`)
      expect(req.method).toBe("PATCH")
      expect(req.body).toEqual({ status })
      expect(orderPutMock).toHaveBeenCalledWith(
        expect.objectContaining({ status })
      )
    })
  }

  it("el ciclo completo es una secuencia de PATCH en orden", async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const { status } = JSON.parse(String(init.body))
      return jsonResponse({ order: serverOrder({ status }) })
    })

    await confirmOrder(TENANT, ORDER)
    await prepareOrder(TENANT, ORDER)
    await markReady(TENANT, ORDER)
    await deliverOrder(TENANT, ORDER)

    const statuses = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(String((init as RequestInit).body)).status
    )
    expect(statuses).toEqual(["confirmed", "preparing", "ready", "delivered"])
  })
})

describe("el server manda", () => {
  it("una transición ilegal devuelve 409 y no toca Dexie", async () => {
    fetchMock.mockResolvedValue(
      errorResponse(409, "transition_invalid", "Transición delivered → preparing no permitida")
    )

    const error = await prepareOrder(TENANT, ORDER).catch((e) => e)

    expect(error).toBeInstanceOf(PosApiError)
    expect((error as PosApiError).code).toBe("transition_invalid")
    expect(orderPutMock).not.toHaveBeenCalled()
  })

  it("una orden ajena a la sede responde 403 y no toca Dexie", async () => {
    fetchMock.mockResolvedValue(
      errorResponse(403, "forbidden", "La sede indicada no pertenece al tenant")
    )

    const error = await markReady(TENANT, ORDER).catch((e) => e)

    expect((error as PosApiError).code).toBe("forbidden")
    expect(orderPutMock).not.toHaveBeenCalled()
  })

  it("una orden inexistente responde 404", async () => {
    fetchMock.mockResolvedValue(errorResponse(404, "not_found", "Orden no encontrada"))

    const error = await cancelOrder(TENANT, "otra-orden").catch((e) => e)

    expect((error as PosApiError).code).toBe("not_found")
  })

  it("Dexie se escribe DESPUÉS de que el server respondió", async () => {
    const order: string[] = []
    fetchMock.mockImplementation(async () => {
      order.push("server")
      return jsonResponse({ order: serverOrder({ status: "preparing" }) })
    })
    orderPutMock.mockImplementation(async () => {
      order.push("dexie")
      return ORDER
    })

    await prepareOrder(TENANT, ORDER)

    expect(order).toEqual(["server", "dexie"])
  })

  it("rehidrata createdAt/updatedAt como Date (D10)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ order: serverOrder() }))

    await confirmOrder(TENANT, ORDER)

    const stored = orderPutMock.mock.calls[0][0]
    expect(stored.createdAt).toBeInstanceOf(Date)
    expect(stored.updatedAt).toBeInstanceOf(Date)
  })
})

describe("liberación de mesa", () => {
  it("al cancelar, refleja localmente la mesa que el server ya liberó", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ order: serverOrder({ status: "cancelled", tableId: TABLE }) })
    )
    tableGetMock.mockResolvedValue({
      id: TABLE,
      tenantId: TENANT,
      status: "occupied",
      currentOrderId: ORDER,
      serverId: "u1",
      needsBill: true,
    })

    await cancelOrder(TENANT, ORDER)

    expect(tableUpdateMock).toHaveBeenCalledWith(TABLE, {
      status: "free",
      currentOrderId: undefined,
      serverId: undefined,
      needsBill: false,
    })
  })

  it("al entregar, idem", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ order: serverOrder({ status: "delivered", tableId: TABLE }) })
    )
    tableGetMock.mockResolvedValue({
      id: TABLE,
      status: "occupied",
      currentOrderId: ORDER,
    })

    await deliverOrder(TENANT, ORDER)

    expect(tableUpdateMock).toHaveBeenCalledTimes(1)
  })

  it("no toca la mesa si la orden no estaba vinculada", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ order: serverOrder({ status: "cancelled", tableId: TABLE }) })
    )
    tableGetMock.mockResolvedValue({
      id: TABLE,
      status: "occupied",
      currentOrderId: "otra-orden",
    })

    await cancelOrder(TENANT, ORDER)

    expect(tableUpdateMock).not.toHaveBeenCalled()
  })

  it("no toca la mesa en transiciones que no la liberan", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ order: serverOrder({ status: "preparing" }) }))

    await prepareOrder(TENANT, ORDER)

    expect(tableGetMock).not.toHaveBeenCalled()
  })

  it("si el server falla, no libera la mesa", async () => {
    fetchMock.mockResolvedValue(errorResponse(409, "conflict", "La orden cambió de estado"))

    await expect(cancelOrder(TENANT, ORDER)).rejects.toThrow("cambió de estado")
    expect(tableUpdateMock).not.toHaveBeenCalled()
  })
})

describe("notify a Sync Layer", () => {
  it("se emite con el jwt que pasa el caller, después de escribir Dexie", async () => {
    const order: string[] = []
    fetchMock.mockImplementation(async () => {
      order.push("server")
      return jsonResponse({ order: serverOrder({ status: "ready" }) })
    })
    orderPutMock.mockImplementation(async () => {
      order.push("dexie")
      return ORDER
    })
    notifyMock.mockImplementation(async () => {
      order.push("notify")
      return true
    })

    await markReady(TENANT, ORDER, JWT)

    expect(order).toEqual(["server", "dexie", "notify"])
    expect(notifyMock).toHaveBeenCalledWith(ORDER, "ready", JWT)
  })

  it("sin jwt no se notifica", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ order: serverOrder({ status: "preparing" }) }))

    await prepareOrder(TENANT, ORDER)

    expect(notifyMock).not.toHaveBeenCalled()
  })
})

describe("outbox", () => {
  it("ninguna transición encola eventos", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ order: serverOrder() }))

    await confirmOrder(TENANT, ORDER, JWT)
    await prepareOrder(TENANT, ORDER, JWT)
    await markReady(TENANT, ORDER, JWT)
    await deliverOrder(TENANT, ORDER, JWT)
    await cancelOrder(TENANT, ORDER, JWT)

    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(enqueueMock).not.toHaveBeenCalled()
  })
})
