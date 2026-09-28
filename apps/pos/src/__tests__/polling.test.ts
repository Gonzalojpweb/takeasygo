import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

import {
  POLL_INTERVAL_MS,
  pollNow,
  runMutation,
  resetPollingState,
  startPosPolling,
  stopPosPolling,
  isPosPollingActive,
} from "../services/polling"
import { refreshRegisters } from "../services/cash"

/**
 * M6 — concurrencia entre terminales.
 *
 * Antes de esto cada terminal solo veía lo que ella misma escribió (D14): si
 * la caja estaba abierta en otra, `openRegister` respondía 409 sin forma
 * local de enterarse. Acá se prueba la única cosa que puede romper un
 * diff-then-put: que pise una escritura propia que todavía estaba en vuelo.
 */

const BASE = "http://saas.test"
const NOW = "2026-09-27T12:00:00.000Z"

const h = vi.hoisted(() => {
  const TENANT = "64b000000000000000000001"
  const LOCATION = "64b0000000000000000000f1"

  type Row = { id: string } & Record<string, unknown>

  function makeTable() {
    const store = new Map<string, Row>()
    const putCalls: Row[] = []
    const bulkPutCalls: Row[][] = []
    const deleteCalls: string[] = []

    const byField = (field: string, value: unknown) =>
      [...store.values()].filter((row) => row[field] === value)

    return {
      store,
      putCalls,
      bulkPutCalls,
      deleteCalls,
      table: {
        get: (id: string) => Promise.resolve(store.get(id)),
        put: (row: Row) => {
          putCalls.push(row)
          store.set(row.id, row)
          return Promise.resolve(row.id)
        },
        bulkPut: (rows: Row[]) => {
          bulkPutCalls.push(rows)
          rows.forEach((row) => store.set(row.id, row))
          return Promise.resolve(rows.map((row) => row.id))
        },
        delete: (id: string) => {
          deleteCalls.push(id)
          store.delete(id)
          return Promise.resolve(id)
        },
        where: (field: string) => ({
          equals: (value: unknown) => ({
            toArray: () => Promise.resolve(byField(field, value)),
            and: () => ({
              toArray: () => Promise.resolve(byField(field, value)),
            }),
            first: () => Promise.resolve(byField(field, value)[0]),
          }),
        }),
      },
    }
  }

  return {
    TENANT,
    LOCATION,
    diningTable: makeTable(),
    orders: makeTable(),
    cashRegister: makeTable(),
  }
})

vi.mock("../db/dexie", () => ({
  db: {
    diningTable: h.diningTable.table,
    orders: h.orders.table,
    cashRegister: h.cashRegister.table,
    tenantConfig: {
      get: async () => ({ tenantId: h.TENANT, locationId: h.LOCATION }),
    },
  },
}))

const TENANT = h.TENANT

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

function serverTable(overrides: Record<string, unknown> = {}) {
  return {
    id: "mesa-1",
    tenantId: TENANT,
    number: 1,
    capacity: 4,
    status: "free",
    needsBill: false,
    ...overrides,
  }
}

function serverOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "ord-1",
    tenantId: TENANT,
    source: "pos",
    status: "pending",
    items: [],
    total: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function serverRegister(overrides: Record<string, unknown> = {}) {
  return {
    id: "caja-1",
    tenantId: TENANT,
    status: "open",
    openedBy: "ana",
    openedAt: NOW,
    initialAmount: 5000,
    movements: [
      {
        id: "mov-1",
        type: "sale",
        amount: 1000,
        reason: "venta",
        channel: "pos",
        paymentMethod: "cash",
        timestamp: NOW,
      },
    ],
    ...overrides,
  }
}

/** Respuestas del server, mutables entre tests. */
const server = {
  tables: [serverTable()] as Record<string, unknown>[],
  orders: [serverOrder()] as Record<string, unknown>[],
  registers: [serverRegister()] as Record<string, unknown>[],
}

function routeFetch(): typeof fetchMock {
  return fetchMock.mockImplementation(async (input: unknown) => {
    const url = String(input)
    if (url.includes("/pos/tables")) {
      return jsonResponse({ tables: server.tables, serverTime: NOW })
    }
    if (url.includes("/pos/cash/registers")) {
      return jsonResponse({ registers: server.registers, serverTime: NOW })
    }
    if (url.includes("/pos/orders")) {
      return jsonResponse({ orders: server.orders, serverTime: NOW })
    }
    return jsonResponse({ error: { code: "not_found", message: "404" } }, 404)
  })
}

function clearCalls(): void {
  for (const bucket of [h.diningTable, h.orders, h.cashRegister]) {
    bucket.putCalls.length = 0
    bucket.bulkPutCalls.length = 0
    bucket.deleteCalls.length = 0
  }
  fetchMock.mockClear()
}

let originalSaasUrl: string | undefined
let visibilityDoc: { visibilityState: string } | undefined
let visibilityListener: (() => void) | undefined

beforeEach(() => {
  originalSaasUrl = import.meta.env.VITE_SAAS_URL
  import.meta.env.VITE_SAAS_URL = BASE

  resetPollingState()
  stopPosPolling()

  for (const bucket of [h.diningTable, h.orders, h.cashRegister]) {
    bucket.store.clear()
    clearCalls()
  }
  server.tables = [serverTable()]
  server.orders = [serverOrder()]
  server.registers = [serverRegister()]

  routeFetch()

  const store = new Map<string, string>()
  store.set(
    "takeasygo_session",
    JSON.stringify({ accessToken: "jwt-de-prueba", expiresAt: 1, tenantId: TENANT })
  )
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
  vi.stubGlobal("window", { dispatchEvent: vi.fn() })
  vi.stubGlobal("fetch", fetchMock)

  visibilityDoc = { visibilityState: "visible" }
  visibilityListener = undefined
  vi.stubGlobal("document", {
    get visibilityState() {
      return visibilityDoc?.visibilityState ?? "visible"
    },
    addEventListener: (_type: string, listener: () => void) => {
      visibilityListener = listener
    },
    removeEventListener: () => {
      visibilityListener = undefined
    },
  })

  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  stopPosPolling()
  import.meta.env.VITE_SAAS_URL = originalSaasUrl
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  visibilityDoc = undefined
  visibilityListener = undefined
})

describe("diff-then-put", () => {
  it("el primer tick hidrata las tres colecciones", async () => {
    const result = await pollNow(TENANT)

    expect(result).toEqual({ tables: 1, orders: 1, registers: 1 })
    expect(h.diningTable.store.has("mesa-1")).toBe(true)
    expect(h.orders.store.has("ord-1")).toBe(true)
    expect(h.cashRegister.store.has("caja-1")).toBe(true)
  })

  it("un segundo tick sin cambios no escribe nada", async () => {
    await pollNow(TENANT)
    clearCalls()

    const result = await pollNow(TENANT)

    expect(result).toEqual({ tables: 0, orders: 0, registers: 0 })
    expect(h.orders.bulkPutCalls).toHaveLength(0)
    expect(h.diningTable.bulkPutCalls).toHaveLength(0)
    expect(h.cashRegister.bulkPutCalls).toHaveLength(0)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("reescribe solo el registro que cambió en el server", async () => {
    await pollNow(TENANT)
    clearCalls()

    server.orders = [serverOrder({ status: "confirmed" })]

    const result = await pollNow(TENANT)

    expect(result.orders).toBe(1)
    expect(result.tables).toBe(0)
    expect(result.registers).toBe(0)
    expect(h.orders.bulkPutCalls).toHaveLength(1)
    expect(h.orders.bulkPutCalls[0][0]).toMatchObject({ id: "ord-1", status: "confirmed" })
  })

  it("un registro local que el server no devuelve NO se borra", async () => {
    // Dexie guarda también órdenes externas, que /pos/orders no conoce.
    h.orders.store.set("externa-1", { id: "externa-1", source: "external" })

    await pollNow(TENANT)

    expect(h.orders.store.has("externa-1")).toBe(true)
    expect(h.orders.deleteCalls).toHaveLength(0)
    expect(h.diningTable.deleteCalls).toHaveLength(0)
    expect(h.cashRegister.deleteCalls).toHaveLength(0)
  })

  it("rehidrata las fechas antes de tocar Dexie (D10)", async () => {
    await pollNow(TENANT)

    const order = h.orders.store.get("ord-1") as unknown as {
      createdAt: Date
      updatedAt: Date
    }
    const register = h.cashRegister.store.get("caja-1") as unknown as {
      openedAt: Date
      movements: { timestamp: Date }[]
    }

    expect(order.createdAt).toBeInstanceOf(Date)
    expect(order.updatedAt).toBeInstanceOf(Date)
    expect(register.openedAt).toBeInstanceOf(Date)
    expect(register.movements[0].timestamp).toBeInstanceOf(Date)
  })
})

describe("guardia de cruce con mutaciones", () => {
  it("con una mutación en vuelo no sale a buscar nada", async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const mutation = runMutation(() => gate)

    const result = await pollNow(TENANT)

    expect(result).toEqual({ tables: 0, orders: 0, registers: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(h.orders.bulkPutCalls).toHaveLength(0)

    release()
    await mutation
  })

  it("una mutación que termina mientras el polling esperaba aborta el tick", async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.includes("/pos/orders")) {
        // Simula otra terminal-local confirmando el pedido justo en medio
        // del fetch: la respuesta que llega después ya está vieja.
        await runMutation(async () => {
          await h.orders.table.put({
            id: "ord-1",
            tenantId: TENANT,
            status: "confirmed",
          })
        })
        return jsonResponse({ orders: [serverOrder()], serverTime: NOW })
      }
      if (url.includes("/pos/tables")) {
        return jsonResponse({ tables: server.tables, serverTime: NOW })
      }
      return jsonResponse({ registers: server.registers, serverTime: NOW })
    })

    await pollNow(TENANT)

    expect(h.orders.bulkPutCalls).toHaveLength(0)
    expect(h.orders.putCalls).toHaveLength(1)
    expect(h.orders.store.get("ord-1")).toMatchObject({ status: "confirmed" })
  })

  it("una mutación posterior gana: el polling no la pisa", async () => {
    // El polling escribe primero, la mutación después → manda la fresca.
    const done = await pollNow(TENANT)
    expect(done.orders).toBe(1)

    await runMutation(async () => {
      await h.orders.table.put({ id: "ord-1", status: "confirmed" })
    })

    expect(h.orders.store.get("ord-1")).toMatchObject({ status: "confirmed" })
  })
})

describe("programación", () => {
  it("arranca con un tick inmediato y sigue con el intervalo", async () => {
    vi.useFakeTimers()

    startPosPolling(TENANT)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(fetchMock).toHaveBeenCalledTimes(6)

    stopPosPolling()
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3)
    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(isPosPollingActive()).toBe(false)
  })

  it("pausa con la pestaña oculta y retoma —con tick— al volver", async () => {
    vi.useFakeTimers()

    startPosPolling(TENANT)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(visibilityListener).toBeTypeOf("function")

    visibilityDoc!.visibilityState = "hidden"
    visibilityListener!()
    fetchMock.mockClear()

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3)
    expect(fetchMock).not.toHaveBeenCalled()

    visibilityDoc!.visibilityState = "visible"
    visibilityListener!()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(3)

    expect(isPosPollingActive()).toBe(true)
  })

  it("arranca de nuevo si cambia la sede", async () => {
    vi.useFakeTimers()

    startPosPolling(TENANT)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(3)

    startPosPolling("64b000000000000000000002")
    expect(isPosPollingActive()).toBe(true)

    stopPosPolling()
  })
})

describe("resiliencia", () => {
  it("si una colección falla, las otras dos igual se aplican", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.includes("/pos/orders")) {
        return jsonResponse({ error: { code: "internal", message: "boom" } }, 500)
      }
      if (url.includes("/pos/tables")) {
        return jsonResponse({ tables: server.tables, serverTime: NOW })
      }
      return jsonResponse({ registers: server.registers, serverTime: NOW })
    })

    const result = await pollNow(TENANT)

    expect(result).toEqual({ tables: 1, orders: 0, registers: 1 })
    expect(console.warn).toHaveBeenCalled()
  })

  it("refreshRegisters delega en el mismo diff-then-put", async () => {
    const first = await refreshRegisters(TENANT)
    expect(first).toHaveLength(1)

    clearCalls()
    const second = await refreshRegisters(TENANT)

    expect(second).toHaveLength(1)
    expect(h.cashRegister.bulkPutCalls).toHaveLength(0)
  })
})
