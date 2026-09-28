import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

import { createOrder, addItem, removeItem, updateItemQuantity } from "../services/order"
import { PosApiError, SESSION_CACHE_KEY } from "../services/pos-api"

/**
 * M5 — creación de órdenes y edición de items contra /api/[tenant]/pos/orders.
 *
 * El server recalcula totales, valida items y resuelve el productId de los
 * items (apps/saas/__tests__/integration/pos-orders.test.ts). Acá cubrimos el
 * contrato del lado POS: el posId es la Idempotency-Key, los items viajan tal
 * cual como los armó el carrito, y solo Dexie del server para adelante.
 */

const TENANT = "64b000000000000000000001"
const LOCATION = "64b0000000000000000000f1"
const BASE = "http://saas.test"
const ORDER = "orden-uuid"
const TABLE = "mesa-uuid"
const PRODUCT = "64b0000000000000000000a1"

const fetchMock = vi.fn()
const orderPutMock = vi.hoisted(() => vi.fn())
const tableGetMock = vi.hoisted(() => vi.fn())
const configGetMock = vi.hoisted(() => vi.fn())
const enqueueMock = vi.hoisted(() => vi.fn())

vi.mock("../db/dexie", () => ({
  db: {
    orders: {
      put: (...args: unknown[]) => orderPutMock(...args),
      get: async () => undefined,
      where: () => ({
        equals: () => ({ and: () => ({ toArray: async () => [] }) }),
      }),
    },
    diningTable: {
      get: (...args: unknown[]) => tableGetMock(...args),
      update: async () => 1,
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
  notifyStatusToSyncLayer: vi.fn(async () => true),
}))

const ITEM = {
  productId: PRODUCT,
  name: "Hamburguesa",
  quantity: 2,
  unitPrice: 500,
  total: 1000,
}

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
    headers: init.headers as Record<string, string>,
    body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
  }
}

function serverOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER,
    tenantId: TENANT,
    source: "pos",
    status: "pending",
    items: [ITEM],
    total: 1000,
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
  tableGetMock.mockReset()
  configGetMock.mockReset()
  enqueueMock.mockReset()

  orderPutMock.mockResolvedValue(ORDER)
  configGetMock.mockResolvedValue({ locationId: LOCATION })
  tableGetMock.mockResolvedValue({ id: TABLE, tenantId: TENANT, status: "free" })

  const store = new Map<string, string>()
  store.set(
    SESSION_CACHE_KEY,
    JSON.stringify({ accessToken: "jwt-de-prueba", expiresAt: 1, tenantId: TENANT })
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

describe("createOrder", () => {
  it("POST /orders con posId = Idempotency-Key", async () => {
    const uuid = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue(ORDER as `${string}-${string}-${string}-${string}-${string}`)
    fetchMock.mockResolvedValue(jsonResponse({ order: serverOrder() }, 201))

    await createOrder(TENANT, TABLE, [ITEM], "sin cebolla")
    uuid.mockRestore()

    const req = lastRequest()
    expect(req.url).toBe(`${BASE}/api/${TENANT}/pos/orders`)
    expect(req.method).toBe("POST")
    expect(req.headers["Idempotency-Key"]).toBe(ORDER)
    expect(req.body).toEqual({
      id: ORDER,
      items: [ITEM],
      tableId: TABLE,
      notes: "sin cebolla",
    })
    expect(orderPutMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: ORDER, createdAt: expect.any(Date) })
    )
  })

  it("omite notes cuando no viene", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ order: serverOrder() }, 201))

    await createOrder(TENANT, TABLE, [ITEM])

    expect(lastRequest().body).not.toHaveProperty("notes")
  })

  it("una mesa sintética de mostrador no viaja: el server la trata como takeaway", async () => {
    tableGetMock.mockResolvedValue(undefined)
    fetchMock.mockResolvedValue(jsonResponse({ order: serverOrder({ tableId: undefined }) }, 201))

    await createOrder(TENANT, `mostrador-${Date.now()}`, [ITEM])

    expect(lastRequest().body).not.toHaveProperty("tableId")
  })

  it("un carrito vacío lo rechaza el server, no una regla local", async () => {
    fetchMock.mockResolvedValue(
      errorResponse(400, "validation", "La orden debe tener al menos un item")
    )

    const error = await createOrder(TENANT, TABLE, []).catch((e) => e)

    expect((error as PosApiError).code).toBe("validation")
    expect(orderPutMock).not.toHaveBeenCalled()
  })

  it("si el server rechaza los items, no toca Dexie", async () => {
    fetchMock.mockResolvedValue(
      errorResponse(400, "validation", "Item \"Hamburguesa\": total del cliente no coincide")
    )

    await expect(createOrder(TENANT, TABLE, [ITEM])).rejects.toBeInstanceOf(PosApiError)
    expect(orderPutMock).not.toHaveBeenCalled()
  })
})

describe("edición de items", () => {
  it("addItem → POST /orders/[id]/items con el item del carrito", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ order: serverOrder() }, 201))

    await addItem(TENANT, ORDER, ITEM)

    const req = lastRequest()
    expect(req.url).toBe(`${BASE}/api/${TENANT}/pos/orders/${ORDER}/items`)
    expect(req.method).toBe("POST")
    expect(req.body).toEqual(ITEM)
    expect(orderPutMock).toHaveBeenCalledTimes(1)
  })

  it("removeItem → DELETE /orders/[id]/items/[productId]", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ order: serverOrder({ items: [] }) }))

    await removeItem(TENANT, ORDER, PRODUCT)

    const req = lastRequest()
    expect(req.url).toBe(`${BASE}/api/${TENANT}/pos/orders/${ORDER}/items/${PRODUCT}`)
    expect(req.method).toBe("DELETE")
    expect(req.body).toBeUndefined()
  })

  it("updateItemQuantity → PATCH con { quantity }", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ order: serverOrder() }))

    await updateItemQuantity(TENANT, ORDER, PRODUCT, 3)

    const req = lastRequest()
    expect(req.url).toBe(
      `${BASE}/api/${TENANT}/pos/orders/${ORDER}/items/${PRODUCT}`
    )
    expect(req.method).toBe("PATCH")
    expect(req.body).toEqual({ quantity: 3 })
  })

  it("quantity 0 viaja igual: el server lo interpreta como quitar", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ order: serverOrder({ items: [] }) }))

    await updateItemQuantity(TENANT, ORDER, PRODUCT, 0)

    expect(lastRequest().body).toEqual({ quantity: 0 })
  })

  it("cantidad negativa se rechaza antes de salir a la red", async () => {
    await expect(updateItemQuantity(TENANT, ORDER, PRODUCT, -1)).rejects.toThrow(
      "cannot be negative"
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("editar items en estado cerrado lo decide el server (409)", async () => {
    fetchMock.mockResolvedValue(
      errorResponse(409, "conflict", "No se pueden editar items en estado delivered")
    )

    const error = await addItem(TENANT, ORDER, ITEM).catch((e) => e)

    expect((error as PosApiError).code).toBe("conflict")
    expect(orderPutMock).not.toHaveBeenCalled()
  })

  it("Dexie se escribe DESPUÉS de que el server respondió", async () => {
    const order: string[] = []
    fetchMock.mockImplementation(async () => {
      order.push("server")
      return jsonResponse({ order: serverOrder() })
    })
    orderPutMock.mockImplementation(async () => {
      order.push("dexie")
      return ORDER
    })

    await addItem(TENANT, ORDER, ITEM)

    expect(order).toEqual(["server", "dexie"])
  })
})

describe("outbox", () => {
  it("crear y editar órdenes no encola eventos", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ order: serverOrder() }, 201))

    await createOrder(TENANT, TABLE, [ITEM])
    await addItem(TENANT, ORDER, ITEM)
    await updateItemQuantity(TENANT, ORDER, PRODUCT, 1)
    await removeItem(TENANT, ORDER, PRODUCT)

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(enqueueMock).not.toHaveBeenCalled()
  })
})
