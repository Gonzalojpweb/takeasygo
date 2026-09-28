import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

import {
  openTable,
  occupyTable,
  freeTable,
  reserveTable,
  closeTable,
  markNeedsAttention,
  markNeedsBill,
} from "../services/table"
import { PosApiError, SESSION_CACHE_KEY } from "../services/pos-api"

/**
 * M5 — services/table.ts contra /api/[tenant]/pos/tables.
 *
 * Contrato que protegemos acá:
 *   1. server-first — nada se escribe en Dexie hasta que el server respondió;
 *      el registro guardado es el que devolvió el server, no el borrador del cliente.
 *   2. el outbox (event-queue) no participa: el hecho ya quedó persistido en el
 *      server, reencolarlo duplicaría la aplicación.
 *   3. la sede y el token los pone pos-api; table.ts solo arma el cuerpo.
 * El transporte fino (URL, headers, códigos) lo cubre pos-api.test.ts.
 */

const TENANT = "64b000000000000000000001"
const LOCATION = "64b0000000000000000000f1"
const BASE = "http://saas.test"

const fetchMock = vi.fn()
const putMock = vi.hoisted(() => vi.fn())
const getMock = vi.hoisted(() => vi.fn())
const configGetMock = vi.hoisted(() => vi.fn())
const enqueueMock = vi.hoisted(() => vi.fn())

vi.mock("../db/dexie", () => ({
  db: {
    diningTable: {
      put: (...args: unknown[]) => putMock(...args),
      get: (...args: unknown[]) => getMock(...args),
      where: () => ({
        equals: () => ({
          and: () => ({ toArray: async () => [] }),
        }),
      }),
    },
    tenantConfig: {
      get: (...args: unknown[]) => configGetMock(...args),
    },
  },
}))

// Guarda de regresión: si alguien vuelve a importar el outbox desde table.ts,
// este mock lo detecta en lugar de fallar en silencio en producción.
vi.mock("../services/event-queue", () => ({
  enqueue: (...args: unknown[]) => enqueueMock(...args),
}))

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

function errorResponse(
  status: number,
  code: string,
  message: string
): Response {
  return jsonResponse({ error: { code, message } }, status)
}

/** Última llamada a fetch, ya parseada. */
function lastRequest() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
  return {
    url: String(url),
    method: init.method,
    headers: init.headers as Record<string, string>,
    body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
  }
}

function serverTable(overrides: Record<string, unknown> = {}) {
  return {
    id: "mesa-uuid",
    tenantId: TENANT,
    number: 7,
    capacity: 4,
    status: "free",
    needsBill: false,
    ...overrides,
  }
}

let originalSaasUrl: string | undefined

beforeEach(() => {
  originalSaasUrl = import.meta.env.VITE_SAAS_URL
  import.meta.env.VITE_SAAS_URL = BASE

  fetchMock.mockReset()
  putMock.mockReset()
  getMock.mockReset()
  configGetMock.mockReset()
  enqueueMock.mockReset()
  putMock.mockResolvedValue("mesa-uuid")
  configGetMock.mockResolvedValue({ locationId: LOCATION })

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

describe("openTable", () => {
  it("POST /pos/tables con el posId que genera el POS", async () => {
    const created = serverTable({ id: "uuid-nuevo" })
    fetchMock.mockResolvedValue(jsonResponse({ table: created }, 201))

    const uuid = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("uuid-nuevo" as `${string}-${string}-${string}-${string}-${string}`)
    await openTable(TENANT, 12, 6, "Terraza")
    uuid.mockRestore()

    const req = lastRequest()
    expect(req.url).toBe(`${BASE}/api/${TENANT}/pos/tables`)
    expect(req.method).toBe("POST")
    expect(req.body).toEqual({
      id: "uuid-nuevo",
      number: 12,
      capacity: 6,
      section: "Terraza",
    })
    expect(putMock).toHaveBeenCalledWith(created)
  })

  it("omite section cuando no viene", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ table: serverTable() }, 201))

    await openTable(TENANT, 3, 2)

    expect(lastRequest().body).toEqual({
      id: expect.any(String),
      number: 3,
      capacity: 2,
    })
  })

  it("si el server rechaza, no toca Dexie", async () => {
    fetchMock.mockResolvedValue(
      errorResponse(400, "validation", "number debe ser un entero entre 1 y 999")
    )

    await expect(openTable(TENANT, 0, 2)).rejects.toThrow(
      "number debe ser un entero"
    )
    expect(putMock).not.toHaveBeenCalled()
  })
})

describe("transiciones", () => {
  const cases: Array<[string, (t: string) => Promise<void>, Record<string, unknown>]> = [
    ["freeTable", (t) => freeTable(TENANT, t), { status: "free" }],
    ["reserveTable", (t) => reserveTable(TENANT, t), { status: "reserved" }],
    ["closeTable", (t) => closeTable(TENANT, t), { status: "closed" }],
    ["markNeedsAttention", (t) => markNeedsAttention(TENANT, t), { status: "needs_attention" }],
  ]

  for (const [name, run, body] of cases) {
    it(`${name} → PATCH ${JSON.stringify(body)}`, async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ table: serverTable({ status: body.status }) })
      )

      await run("mesa-uuid")

      const req = lastRequest()
      expect(req.url).toBe(`${BASE}/api/${TENANT}/pos/tables/mesa-uuid`)
      expect(req.method).toBe("PATCH")
      expect(req.body).toEqual(body)
      expect(putMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: body.status })
      )
    })
  }

  it("occupyTable manda mesero y orden junto con el estado", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        table: serverTable({ status: "occupied", serverId: "u1", currentOrderId: "o1" }),
      })
    )

    await occupyTable(TENANT, "mesa-uuid", "u1", "o1")

    expect(lastRequest().body).toEqual({
      status: "occupied",
      serverId: "u1",
      currentOrderId: "o1",
    })
  })

  it("freeTable no manda currentOrderId/serverId: los limpia el server", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        table: serverTable({ status: "free", currentOrderId: null, serverId: null }),
      })
    )

    await freeTable(TENANT, "mesa-uuid")

    expect(lastRequest().body).toEqual({ status: "free" })
  })

  it("markNeedsBill toca solo el flag, sin transición", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ table: serverTable({ status: "occupied", needsBill: true }) })
    )

    await markNeedsBill(TENANT, "mesa-uuid", true)

    expect(lastRequest().body).toEqual({ needsBill: true })
  })
})

describe("el server manda", () => {
  it("un conflicto de transición se propaga y no escribe Dexie", async () => {
    fetchMock.mockResolvedValue(
      errorResponse(409, "transition_invalid", "Transición free → needs_attention no permitida")
    )

    const error = await markNeedsAttention(TENANT, "mesa-uuid").catch((e) => e)
    expect(error).toBeInstanceOf(PosApiError)
    expect((error as PosApiError).code).toBe("transition_invalid")
    expect(putMock).not.toHaveBeenCalled()
  })

  it("una mesa ajena a la sede responde 403 y no escribe Dexie", async () => {
    fetchMock.mockResolvedValue(
      errorResponse(403, "forbidden", "La sede indicada no pertenece al tenant")
    )

    const error = await freeTable(TENANT, "mesa-otra").catch((e) => e)
    expect((error as PosApiError).code).toBe("forbidden")
    expect(putMock).not.toHaveBeenCalled()
  })

  it("guarda exactamente lo que devolvió el server, no el borrador del cliente", async () => {
    const fromServer = serverTable({
      status: "occupied",
      currentOrderId: "orden-server",
      needsBill: true,
      section: "Barra",
    })
    fetchMock.mockResolvedValue(jsonResponse({ table: fromServer }))

    await occupyTable(TENANT, "mesa-uuid", "u1", "orden-cliente")

    expect(putMock).toHaveBeenCalledWith(fromServer)
  })

  it("Dexie se escribe DESPUÉS de que el server respondió", async () => {
    const order: string[] = []
    fetchMock.mockImplementation(async () => {
      order.push("server")
      return jsonResponse({ table: serverTable() })
    })
    putMock.mockImplementation(async () => {
      order.push("dexie")
      return "mesa-uuid"
    })

    await freeTable(TENANT, "mesa-uuid")

    expect(order).toEqual(["server", "dexie"])
  })

  it("el posId viaja escapado en la URL", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ table: serverTable() }))

    await freeTable(TENANT, "mesa con/espacio")

    expect(lastRequest().url).toContain("/pos/tables/mesa%20con%2Fespacio")
  })

  it("la sede y el token los pone pos-api, table.ts no toca headers", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ table: serverTable() }))

    await freeTable(TENANT, "mesa-uuid")

    const { headers } = lastRequest()
    expect(headers.Authorization).toBe("Bearer jwt-de-prueba")
    expect(headers["X-Location-Id"]).toBe(LOCATION)
    expect(headers["Content-Type"]).toBe("application/json")
  })
})

describe("outbox", () => {
  it("ninguna mutación de mesas encola eventos", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ table: serverTable() }, 201))

    await openTable(TENANT, 1, 2)
    await occupyTable(TENANT, "mesa-uuid", "u1", "o1")
    await freeTable(TENANT, "mesa-uuid")
    await reserveTable(TENANT, "mesa-uuid")
    await closeTable(TENANT, "mesa-uuid")
    await markNeedsAttention(TENANT, "mesa-uuid")
    await markNeedsBill(TENANT, "mesa-uuid", false)

    expect(fetchMock).toHaveBeenCalledTimes(7)
    expect(enqueueMock).not.toHaveBeenCalled()
  })
})
