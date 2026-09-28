import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

import {
  openRegister,
  closeRegister,
  addMovement,
  assignPendingMovements,
} from "../services/cash"
import { PosApiError, SESSION_CACHE_KEY } from "../services/pos-api"

/**
 * M5 — services/cash.ts contra /api/[tenant]/pos/cash/registers*.
 *
 * El arqueo (§1), la idempotencia de movimientos (§2.1), la una-caja-por-sede
 * (§2) y el Z inmutable (§3) los decide el server y ya están cubiertos por
 * apps/saas/__tests__/integration/pos-cash.test.ts. Acá protegemos el contrato
 * del lado POS:
 *   · server-first: Dexie recién con la respuesta del server
 *   · el Z y el shareToken NO los genera el cliente
 *   · las fechas del JSON se rehidratan antes de tocar Dexie (D10)
 *   · el outbox ya no participa
 */

const TENANT = "64b000000000000000000001"
const LOCATION = "64b0000000000000000000f1"
const BASE = "http://saas.test"
const REGISTER = "caja-uuid"

const fetchMock = vi.fn()
const putMock = vi.hoisted(() => vi.fn())
const getMock = vi.hoisted(() => vi.fn())
const configGetMock = vi.hoisted(() => vi.fn())
const pendingWhereMock = vi.hoisted(() => vi.fn())
const pendingDeleteMock = vi.hoisted(() => vi.fn())
const enqueueMock = vi.hoisted(() => vi.fn())

vi.mock("../db/dexie", () => ({
  db: {
    cashRegister: {
      put: (...args: unknown[]) => putMock(...args),
      bulkPut: (...args: unknown[]) => putMock(...args),
      get: (...args: unknown[]) => getMock(...args),
      where: () => ({
        equals: () => ({
          and: () => ({
            first: () => Promise.resolve(undefined),
            toArray: () => Promise.resolve([]),
          }),
          toArray: () => Promise.resolve([]),
        }),
      }),
    },
    pendingMovements: {
      where: (...args: unknown[]) => pendingWhereMock(...args),
      delete: (...args: unknown[]) => pendingDeleteMock(...args),
    },
    tenantConfig: {
      get: (...args: unknown[]) => configGetMock(...args),
    },
  },
}))

// Guarda de regresión: ninguna escritura de caja puede volver al outbox.
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

function serverRegister(overrides: Record<string, unknown> = {}) {
  return {
    id: REGISTER,
    tenantId: TENANT,
    openedBy: "Operador",
    openedAt: "2026-09-27T12:00:00.000Z",
    initialAmount: 10000,
    expectedAmount: 10000,
    movements: [],
    status: "open",
    defaultForChannel: null,
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
  pendingWhereMock.mockReset()
  pendingDeleteMock.mockReset()
  enqueueMock.mockReset()

  putMock.mockResolvedValue(REGISTER)
  configGetMock.mockResolvedValue({ locationId: LOCATION })
  pendingWhereMock.mockReturnValue({
    equals: () => ({ toArray: async () => [] }),
  })
  pendingDeleteMock.mockResolvedValue(undefined)

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

describe("openRegister", () => {
  it("POST /cash/registers con el posId que genera el POS", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ register: serverRegister() }, 201))

    const uuid = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("caja-uuid" as `${string}-${string}-${string}-${string}-${string}`)
    await openRegister(TENANT, 10000, "Operador", "counter")
    uuid.mockRestore()

    const req = lastRequest()
    expect(req.url).toBe(`${BASE}/api/${TENANT}/pos/cash/registers`)
    expect(req.method).toBe("POST")
    expect(req.body).toEqual({
      id: "caja-uuid",
      initialAmount: 10000,
      openedBy: "Operador",
      defaultForChannel: "counter",
    })
    expect(putMock).toHaveBeenCalledTimes(1)
  })

  it("no consulta Dexie antes: la regla de una-caja-por-sede es del server", async () => {
    fetchMock.mockResolvedValue(errorResponse(409, "conflict", "Ya hay una caja abierta en esta sede"))

    const error = await openRegister(TENANT, 10000, "Operador").catch((e) => e)

    expect((error as PosApiError).code).toBe("conflict")
    expect(putMock).not.toHaveBeenCalled()
  })

  it("rehidrata openedAt como Date antes de guardarlo (D10)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ register: serverRegister() }, 201))

    const register = await openRegister(TENANT, 10000, "Operador")

    expect(register.openedAt).toBeInstanceOf(Date)
    expect(register.openedAt.toISOString()).toBe("2026-09-27T12:00:00.000Z")
    expect(putMock).toHaveBeenCalledWith(
      expect.objectContaining({ openedAt: expect.any(Date) })
    )
  })
})

describe("closeRegister", () => {
  it("POST .../close con finalAmount y closedBy; el Z viene del server", async () => {
    const closed = serverRegister({
      status: "closed",
      closedBy: "Operador",
      closedAt: "2026-09-27T18:00:00.000Z",
      finalAmount: 10100,
      expectedAmount: 10000,
      difference: 100,
      zReport: {
        registerId: REGISTER,
        tenantId: TENANT,
        closedAt: "2026-09-27T18:00:00.000Z",
        closedBy: "Operador",
        initialAmount: 10000,
        finalAmount: 10100,
        expectedAmount: 10000,
        difference: 100,
        byChannel: { counter: {}, takeasygo: {} },
        byPaymentMethod: {},
        totalMovements: 0,
        incomeTotal: 0,
        expenseTotal: 0,
        salesTotal: 0,
        refundTotal: 0,
        generatedAt: "2026-09-27T18:00:00.000Z",
      },
      shareToken: "token-compartido",
    })
    fetchMock.mockResolvedValue(jsonResponse({ register: closed }))

    const result = await closeRegister(TENANT, REGISTER, 10100, "Operador")

    const req = lastRequest()
    expect(req.url).toBe(`${BASE}/api/${TENANT}/pos/cash/registers/${REGISTER}/close`)
    expect(req.method).toBe("POST")
    expect(req.body).toEqual({ finalAmount: 10100, closedBy: "Operador" })

    expect(result.zReport).toBeDefined()
    expect(result.shareToken).toBe("token-compartido")
    expect(result.closedAt).toBeInstanceOf(Date)
    expect(result.zReport!.closedAt).toBeInstanceOf(Date)
    expect(result.zReport!.generatedAt).toBeInstanceOf(Date)
  })

  it("si el server dice que ya está cerrada, no toca Dexie", async () => {
    fetchMock.mockResolvedValue(errorResponse(409, "conflict", "La caja ya está cerrada"))

    const error = await closeRegister(TENANT, REGISTER, 10100, "Operador").catch((e) => e)

    expect((error as PosApiError).code).toBe("conflict")
    expect(putMock).not.toHaveBeenCalled()
  })
})

describe("addMovement", () => {
  const baseMovement = {
    id: "mov-uuid",
    type: "sale",
    amount: 2000,
    reason: "Venta",
    userId: "u1",
    timestamp: "2026-09-27T13:00:00.000Z",
    channel: "counter",
    paymentMethod: "cash",
  }

  it("POST .../movements con el posId y todos los campos del hecho", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ movement: baseMovement, register: serverRegister() })
    )

    await addMovement(TENANT, REGISTER, "sale", 2000, "Venta", "u1", "counter", "cash", "ord_1")

    const req = lastRequest()
    expect(req.url).toBe(
      `${BASE}/api/${TENANT}/pos/cash/registers/${REGISTER}/movements`
    )
    expect(req.method).toBe("POST")
    expect(req.body).toEqual({
      id: expect.any(String),
      type: "sale",
      amount: 2000,
      reason: "Venta",
      channel: "counter",
      paymentMethod: "cash",
      userId: "u1",
      relatedOrderId: "ord_1",
    })
  })

  it("omite relatedOrderId cuando no viene", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ movement: baseMovement, register: serverRegister() })
    )

    await addMovement(TENANT, REGISTER, "sale", 2000, "Venta", "u1", "counter", "cash")

    expect(lastRequest().body).not.toHaveProperty("relatedOrderId")
  })

  it("el arqueo lo calcula el server: guarda el expectedAmount que devolvió", async () => {
    const fromServer = serverRegister({ expectedAmount: 12000 })
    fetchMock.mockResolvedValue(
      jsonResponse({ movement: baseMovement, register: fromServer })
    )

    const { register } = await addMovement(
      TENANT, REGISTER, "income", 2000, "Pago", "u1", "counter", "cash"
    )

    expect(register.expectedAmount).toBe(12000)
    expect(putMock).toHaveBeenCalledWith(expect.objectContaining({ expectedAmount: 12000 }))
  })

  it("rehidrata el timestamp del movimiento guardado", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        movement: baseMovement,
        register: serverRegister({
          movements: [baseMovement],
          expectedAmount: 12000,
        }),
      })
    )

    await addMovement(TENANT, REGISTER, "sale", 2000, "Venta", "u1", "counter", "cash")

    const stored = putMock.mock.calls[0][0]
    expect(stored.movements[0].timestamp).toBeInstanceOf(Date)
  })

  it("rechaza monto no positivo sin salir a la red", async () => {
    await expect(
      addMovement(TENANT, REGISTER, "sale", 0, "Zero", "u1", "counter", "cash")
    ).rejects.toThrow("El monto debe ser positivo")

    await expect(
      addMovement(TENANT, REGISTER, "sale", -100, "Neg", "u1", "counter", "cash")
    ).rejects.toThrow("El monto debe ser positivo")

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("una caja cerrada la decide el server, no Dexie", async () => {
    fetchMock.mockResolvedValue(errorResponse(409, "conflict", "La caja está cerrada"))

    const error = await addMovement(
      TENANT, REGISTER, "sale", 100, "Test", "u1", "counter", "cash"
    ).catch((e) => e)

    expect((error as PosApiError).code).toBe("conflict")
    expect(putMock).not.toHaveBeenCalled()
  })
})

describe("assignPendingMovements", () => {
  function pendingList(items: unknown[]) {
    pendingWhereMock.mockReturnValue({
      equals: () => ({ toArray: async () => items }),
    })
  }

  it("lee la caja del server y sube cada pendiente como movimiento", async () => {
    pendingList([
      {
        id: "p1",
        tenantId: TENANT,
        type: "sale",
        amount: 4500,
        reason: "Venta TakeasyGO #o1",
        userId: "system",
        timestamp: new Date(),
        relatedOrderId: "o1",
        channel: "takeasygo",
        paymentMethod: "mercadopago",
        source: "takeasygo_sync",
        createdAt: new Date(),
      },
    ])

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ register: serverRegister({ defaultForChannel: null }) }))
      .mockResolvedValueOnce(
        jsonResponse({
          movement: { id: "m1", type: "sale", amount: 4500 },
          register: serverRegister({
            movements: [{ id: "m1", relatedOrderId: "o1", type: "sale" }],
          }),
        })
      )

    const { assigned, register } = await assignPendingMovements(TENANT, REGISTER)

    expect(assigned).toBe(1)
    expect(register.movements).toHaveLength(1)
    expect(pendingDeleteMock).toHaveBeenCalledWith("p1")
    expect(lastRequest().method).toBe("POST")
    expect(lastRequest().body).toMatchObject({ relatedOrderId: "o1" })
  })

  it("si el server rechaza, el pendiente queda en la cola", async () => {
    pendingList([
      {
        id: "p1",
        tenantId: TENANT,
        type: "sale",
        amount: 4500,
        reason: "Venta",
        userId: "system",
        timestamp: new Date(),
        relatedOrderId: "o1",
        channel: "takeasygo",
        paymentMethod: "cash",
        source: "takeasygo_sync",
        createdAt: new Date(),
      },
    ])

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ register: serverRegister({ defaultForChannel: null }) }))
      .mockResolvedValueOnce(errorResponse(409, "conflict", "La caja está cerrada"))

    await expect(assignPendingMovements(TENANT, REGISTER)).rejects.toThrow(
      "La caja está cerrada"
    )
    expect(pendingDeleteMock).not.toHaveBeenCalled()
  })

  it("salta los pendientes de un canal que esta caja no atiende", async () => {
    pendingList([
      {
        id: "p1",
        tenantId: TENANT,
        type: "sale",
        amount: 100,
        reason: "Venta",
        userId: "system",
        timestamp: new Date(),
        relatedOrderId: "o1",
        channel: "takeasygo",
        paymentMethod: "cash",
        source: "takeasygo_sync",
        createdAt: new Date(),
      },
    ])

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ register: serverRegister({ defaultForChannel: "counter" }) })
    )

    const { assigned } = await assignPendingMovements(TENANT, REGISTER)

    expect(assigned).toBe(0)
    expect(pendingDeleteMock).not.toHaveBeenCalled()
  })

  it("no reenvía lo que Dexie ya muestra como aplicado", async () => {
    pendingList([
      {
        id: "p1",
        tenantId: TENANT,
        type: "sale",
        amount: 100,
        reason: "Venta",
        userId: "system",
        timestamp: new Date(),
        relatedOrderId: "o1",
        channel: "takeasygo",
        paymentMethod: "cash",
        source: "takeasygo_sync",
        createdAt: new Date(),
      },
    ])

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        register: serverRegister({
          defaultForChannel: null,
          movements: [{ id: "m0", relatedOrderId: "o1", type: "sale" }],
        }),
      })
    )

    const { assigned } = await assignPendingMovements(TENANT, REGISTER)

    expect(assigned).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(pendingDeleteMock).toHaveBeenCalledWith("p1")
  })
})

describe("outbox", () => {
  it("ninguna escritura de caja encola eventos", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ register: serverRegister() }, 201))
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        movement: { id: "m1", type: "sale", amount: 100, timestamp: "2026-09-27T13:00:00.000Z" },
        register: serverRegister(),
      })
    )
    fetchMock.mockResolvedValueOnce(jsonResponse({ register: serverRegister({ status: "closed" }) }))

    await openRegister(TENANT, 10000, "Operador")
    await addMovement(TENANT, REGISTER, "sale", 100, "Venta", "u1", "counter", "cash")
    await closeRegister(TENANT, REGISTER, 10100, "Operador")

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(enqueueMock).not.toHaveBeenCalled()
  })
})
