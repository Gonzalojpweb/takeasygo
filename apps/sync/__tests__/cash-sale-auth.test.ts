import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"
import express from "express"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import type { Request, Response, NextFunction } from "express"

// Captura el env original y fuerza SOLO SYNC_LAYER_SECRET (sin
// INTERNAL_API_SECRET): además de probar los headers, prueba el alias de env
// de config.internalApiSecret. Se restaura en afterAll.
const envOrig = vi.hoisted(() => {
  const orig = {
    internal: process.env.INTERNAL_API_SECRET,
    sync: process.env.SYNC_LAYER_SECRET,
  }
  delete process.env.INTERNAL_API_SECRET
  process.env.SYNC_LAYER_SECRET = "cash-sale-test-secret"
  return orig
})

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findByIdAndUpdate: vi.fn(),
  create: vi.fn(),
  find: vi.fn(),
  enqueueCashSaleDelivery: vi.fn(async () => undefined),
}))

vi.mock("@takeasygo/db", () => ({
  CashSaleEventModel: {
    findById: mocks.findById,
    findByIdAndUpdate: mocks.findByIdAndUpdate,
    create: mocks.create,
    find: mocks.find,
  },
}))

vi.mock("../src/queues/cash-sale-queue", () => ({
  enqueueCashSaleDelivery: mocks.enqueueCashSaleDelivery,
}))

// JWT controlado: solo "Bearer jwt-pos-ok" autentica, con tenant fijo
// tenant_a (las mismas reglas que el middleware real, sin crypto).
vi.mock("../src/auth/middleware", () => ({
  authMiddleware: vi.fn(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (req.headers.authorization === "Bearer jwt-pos-ok") {
        Object.assign(req, { auth: { sub: "u1", tenantId: "tenant_a", role: "manager" } })
        next()
        return
      }
      res.status(401).json({ error: "Missing or invalid authorization header" })
    }
  ),
}))

import { cashSaleRouter } from "../src/routes/cash-sale"

const TEST_SECRET = "cash-sale-test-secret"
const TENANT_OK = "tenant_a"
const TENANT_OTHER = "tenant_b"
const EVENT_ID = "evt_65000000000000000000aa"

const validBody = {
  orderId: "ord_1",
  tenantId: TENANT_OK,
  amount: 1500,
  paymentMethod: "cash",
  orderMode: "takeaway",
}

const emitted: Array<{ room: string; event: string }> = []
const io = {
  to: (room: string) => ({
    emit: (event: string) => {
      emitted.push({ room, event })
    },
  }),
} as never

const queue = {} as never

let server: Server
let base: string

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

function patch(path: string, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, { method: "PATCH", headers })
}

beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use("/api/v1/cash-sale", cashSaleRouter(io, queue))
  server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/cash-sale`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  )
  if (envOrig.internal === undefined) delete process.env.INTERNAL_API_SECRET
  else process.env.INTERNAL_API_SECRET = envOrig.internal
  if (envOrig.sync === undefined) delete process.env.SYNC_LAYER_SECRET
  else process.env.SYNC_LAYER_SECRET = envOrig.sync
})

beforeEach(() => {
  emitted.length = 0
  mocks.findById.mockReset()
  mocks.findByIdAndUpdate.mockReset().mockResolvedValue({})
  mocks.create.mockReset().mockResolvedValue({ _id: EVENT_ID })
  mocks.find.mockReset().mockReturnValue({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) })
  mocks.enqueueCashSaleDelivery.mockReset().mockResolvedValue(undefined)
  mocks.findById.mockResolvedValue({
    _id: EVENT_ID,
    tenantId: TENANT_OK,
    status: "pending",
  })
})

describe("POST / — crear evento (SaaS → Sync)", () => {
  it("acepta X-Internal-Secret correcto (estilo notifyCashSale) y encola", async () => {
    const res = await post("/", validBody, { "x-internal-secret": TEST_SECRET })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { status: string }
    expect(json.status).toBe("forwarded")
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueCashSaleDelivery).toHaveBeenCalledTimes(1)
    expect(emitted).toEqual([{ room: `tenant:${TENANT_OK}`, event: "cash_sale" }])
  })

  it("acepta Authorization: Bearer <secret> (estilo helpers internos)", async () => {
    const res = await post("/", validBody, {
      authorization: `Bearer ${TEST_SECRET}`,
    })
    expect(res.status).toBe(200)
    expect(mocks.enqueueCashSaleDelivery).toHaveBeenCalledTimes(1)
  })

  it("rechaza X-Internal-Secret incorrecto con 401 (negativo)", async () => {
    const res = await post("/", validBody, { "x-internal-secret": "wrong-secret" })
    expect(res.status).toBe(401)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.enqueueCashSaleDelivery).not.toHaveBeenCalled()
  })

  it("rechaza Bearer con valor que no es el secreto (negativo: un JWT no crea eventos)", async () => {
    const res = await post("/", validBody, { authorization: "Bearer jwt-pos-ok" })
    expect(res.status).toBe(401)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("rechaza sin credenciales con 401 (negativo)", async () => {
    const res = await post("/", validBody)
    expect(res.status).toBe(401)
    expect(mocks.create).not.toHaveBeenCalled()
  })
})

describe("PATCH /:eventId/deliver — ACK", () => {
  it("server-to-server con X-Internal-Secret marca delivered", async () => {
    const res = await patch(`/${EVENT_ID}/deliver`, {
      "x-internal-secret": TEST_SECRET,
    })
    expect(res.status).toBe(200)
    expect(mocks.findByIdAndUpdate).toHaveBeenCalledWith(
      EVENT_ID,
      { status: "delivered" },
      { new: true }
    )
  })

  it("POS con Bearer JWT del mismo tenant marca delivered (antes: 401)", async () => {
    const res = await patch(`/${EVENT_ID}/deliver`, {
      authorization: "Bearer jwt-pos-ok",
    })
    expect(res.status).toBe(200)
    expect(mocks.findByIdAndUpdate).toHaveBeenCalledTimes(1)
  })

  it("JWT de OTRO tenant devuelve 403 y NO muta el evento (negativo)", async () => {
    mocks.findById.mockResolvedValue({
      _id: EVENT_ID,
      tenantId: TENANT_OTHER,
      status: "pending",
    })
    const res = await patch(`/${EVENT_ID}/deliver`, {
      authorization: "Bearer jwt-pos-ok",
    })
    expect(res.status).toBe(403)
    expect(mocks.findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it("JWT inválido devuelve 401 (negativo)", async () => {
    const res = await patch(`/${EVENT_ID}/deliver`, {
      authorization: "Bearer jwt-malo",
    })
    expect(res.status).toBe(401)
    expect(mocks.findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it("sin credenciales devuelve 401 (negativo)", async () => {
    const res = await patch(`/${EVENT_ID}/deliver`)
    expect(res.status).toBe(401)
    expect(mocks.findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it("secreto interno incorrecto devuelve 401 (negativo)", async () => {
    const res = await patch(`/${EVENT_ID}/deliver`, {
      "x-internal-secret": "wrong-secret",
    })
    expect(res.status).toBe(401)
    expect(mocks.findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it("evento inexistente devuelve 404 (con auth interno válido)", async () => {
    mocks.findById.mockResolvedValue(null)
    const res = await patch(`/${EVENT_ID}/deliver`, {
      "x-internal-secret": TEST_SECRET,
    })
    expect(res.status).toBe(404)
    expect(mocks.findByIdAndUpdate).not.toHaveBeenCalled()
  })
})
