import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"
import express from "express"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"

// ── Mocks (hoisted: se resuelven antes de importar el router) ────────────────
const mocks = vi.hoisted(() => ({
  updateOrderStatus: vi.fn(async () => true),
  findOne: vi.fn(),
  enqueueConfirmForward: vi.fn(async () => undefined),
}))

vi.mock("../src/services/order-translator", () => ({
  createTranslatedOrder: vi.fn(),
  updateOrderStatus: mocks.updateOrderStatus,
}))

vi.mock("@takeasygo/db", () => ({
  SyncOrderModel: { findOne: mocks.findOne },
}))

vi.mock("../src/queues/order-confirm-forward-queue", () => ({
  enqueueConfirmForward: mocks.enqueueConfirmForward,
}))

import { internalRouter } from "../src/routes/internal"

// ── Harness ──────────────────────────────────────────────────────────────────
const SAAS_ID = "666666666666666666666666"
const SYNC_ID = "6500000000000000000000aa"
const TENANT = "tenant_pos_test"

type Emitted = { room: string; event: string; payload: Record<string, unknown> }
const emitted: Emitted[] = []

const io = {
  to: (room: string) => ({
    emit: (event: string, payload: Record<string, unknown>) => {
      emitted.push({ room, event, payload })
    },
  }),
} as never

type FakeJob = { getState: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }
let currentJob: FakeJob | null
const getJobCalls: string[] = []
const orderQueue = {
  getJob: vi.fn(async (id: string) => {
    getJobCalls.push(id)
    return currentJob
  }),
}
const confirmForwardQueue = {} as never

function setSyncOrder(doc: Record<string, unknown> | null) {
  mocks.findOne.mockImplementation(() => ({ lean: async () => doc }))
}

let server: Server
let base: string

function job(state: string): FakeJob {
  return {
    getState: vi.fn(async () => state),
    remove: vi.fn(async () => undefined),
  }
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
    },
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use(
    "/api/v1/internal",
    internalRouter(io, orderQueue as never, confirmForwardQueue)
  )
  server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/internal`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  )
})

beforeEach(() => {
  emitted.length = 0
  getJobCalls.length = 0
  currentJob = job("delayed")
  mocks.updateOrderStatus.mockClear().mockResolvedValue(true)
  mocks.enqueueConfirmForward.mockClear()
  setSyncOrder({
    _id: { toString: () => SYNC_ID },
    locationId: "loc1",
    externalOrderId: SAAS_ID,
  })
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /internal/orders/:orderId/status (SaaS → Sync → POS)", () => {
  it("emite order:status_updated con el _id del SyncLayer, no con el id del SaaS (Bug B)", async () => {
    const res = await post(`/orders/${SAAS_ID}/status`, {
      tenantId: TENANT,
      status: "preparing",
      skipForward: true,
    })

    expect(res.status).toBe(200)
    const evt = emitted.find((e) => e.event === "order:status_updated")
    expect(evt).toBeDefined()
    expect(evt!.payload.orderId).toBe(SYNC_ID)
    expect(evt!.payload.externalStatus).toBe("preparing")
  })

  it("emite a la sala de tenant y a la de ubicación", async () => {
    await post(`/orders/${SAAS_ID}/status`, {
      tenantId: TENANT,
      status: "preparing",
      skipForward: true,
    })

    const rooms = emitted.filter((e) => e.event === "order:status_updated").map((e) => e.room)
    expect(rooms).toContain(`tenant:${TENANT}`)
    expect(rooms).toContain(`tenant:${TENANT}:location:loc1`)
  })

  it("remueve el timeout offline con el _id del SyncLayer cuando el status avanza", async () => {
    await post(`/orders/${SAAS_ID}/status`, {
      tenantId: TENANT,
      status: "preparing",
      skipForward: true,
    })

    expect(getJobCalls).toContain(SYNC_ID)
    expect(getJobCalls).not.toContain(SAAS_ID)
    expect(currentJob!.remove).toHaveBeenCalledTimes(1)
  })

  it("NO remueve el timeout para un status en espera (awaiting_payment)", async () => {
    await post(`/orders/${SAAS_ID}/status`, {
      tenantId: TENANT,
      status: "awaiting_payment",
      skipForward: true,
    })

    expect(getJobCalls).toHaveLength(0)
    expect(currentJob!.remove).not.toHaveBeenCalled()
  })

  it("sin skipForward reenvía al SaaS vía outbox (forward normal del POS)", async () => {
    await post(`/orders/${SAAS_ID}/status`, {
      tenantId: TENANT,
      status: "ready",
    })

    expect(mocks.enqueueConfirmForward).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueConfirmForward).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        externalOrderId: SAAS_ID,
        status: "ready",
      })
    )
  })

  it("con skipForward NO reenvía (evita el loop SaaS → Sync → SaaS)", async () => {
    await post(`/orders/${SAAS_ID}/status`, {
      tenantId: TENANT,
      status: "ready",
      skipForward: true,
    })

    expect(mocks.enqueueConfirmForward).not.toHaveBeenCalled()
  })

  it("responde 404 si el pedido no existe en Sync", async () => {
    mocks.updateOrderStatus.mockResolvedValue(false)

    const res = await post(`/orders/${SAAS_ID}/status`, {
      tenantId: TENANT,
      status: "preparing",
      skipForward: true,
    })

    expect(res.status).toBe(404)
    expect(emitted).toHaveLength(0)
  })

  it("si el parámetro es el id del SaaS y no hay syncOrder, usa el parámetro (fallback)", async () => {
    setSyncOrder(null)

    await post(`/orders/${SAAS_ID}/status`, {
      tenantId: TENANT,
      status: "preparing",
      skipForward: true,
    })

    const evt = emitted.find((e) => e.event === "order:status_updated")
    expect(evt!.payload.orderId).toBe(SAAS_ID)
  })
})

describe("PATCH /internal/orders/:orderId/confirm (confirmación de pago)", () => {
  it("emite order:confirmed + order:status_updated con el _id del SyncLayer", async () => {
    const res = await fetch(`${base}/orders/${SAAS_ID}/confirm`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
      },
      body: JSON.stringify({ tenantId: TENANT }),
    })

    expect(res.status).toBe(200)
    const confirmed = emitted.find((e) => e.event === "order:confirmed")
    const status = emitted.find((e) => e.event === "order:status_updated")
    expect(confirmed!.payload.orderId).toBe(SYNC_ID)
    expect(status!.payload.orderId).toBe(SYNC_ID)
    expect(status!.payload.externalStatus).toBe("confirmed")
  })

  it("remueve el timeout offline por el _id del SyncLayer (antes usaba el id del SaaS)", async () => {
    await fetch(`${base}/orders/${SAAS_ID}/confirm`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
      },
      body: JSON.stringify({ tenantId: TENANT }),
    })

    expect(getJobCalls).toContain(SYNC_ID)
    expect(getJobCalls).not.toContain(SAAS_ID)
    expect(currentJob!.remove).toHaveBeenCalledTimes(1)
  })

  it("encola el forward al SaaS con el externalOrderId resuelto", async () => {
    await fetch(`${base}/orders/${SAAS_ID}/confirm`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
      },
      body: JSON.stringify({ tenantId: TENANT }),
    })

    expect(mocks.enqueueConfirmForward).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ externalOrderId: SAAS_ID })
    )
  })

  it("rechaza sin tenantId", async () => {
    const res = await fetch(`${base}/orders/${SAAS_ID}/confirm`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
      },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
  })
})
