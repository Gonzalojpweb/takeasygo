import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"
import express from "express"
import type { Server } from "node:http"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { signJwt } from "@takeasygo/business/jwt"
import { authMiddleware } from "../src/auth/middleware"
import { syncRouter } from "../src/routes/sync"
import { getDeviceSecret } from "../src/routes/pairing"
import { validateEvent } from "../src/services/event-validator"
import {
  __setDenyRedisForTests,
  __resetJtiDenylistForTests,
} from "../src/auth/jtiDenylist"

/**
 * S1 — fail-closed de /sync/replay: si el tenant no tiene deviceSecret,
 * los eventos se RECHAZAN (antes se saltaba la validación entera:
 * `if (deviceSecret)` era un fail-open sobre la integridad de las
 * ventas offline).
 */

vi.mock("../src/routes/pairing", () => ({
  getDeviceSecret: vi.fn(),
}))
vi.mock("../src/services/event-validator", () => ({
  validateEvent: vi.fn(),
}))
vi.mock("../src/services/order-translator", () => ({
  getPendingOrders: vi.fn(async () => []),
  updateOrderStatus: vi.fn(),
}))
vi.mock("../src/queues/order-confirm-forward-queue", () => ({
  enqueueConfirmForward: vi.fn(),
}))

const PRIVATE_PEM = readFileSync(
  fileURLToPath(new URL("../keys.private.pem", import.meta.url)),
  "utf-8"
).trim()

const basePayload = {
  sub: "64b0000000000000000000a1",
  tenantId: "64b0000000000000000000b2",
  role: "manager" as const,
  deviceType: "hub" as const,
  locationId: "64b0000000000000000000c3",
}

const fakeIo = {
  to: () => ({ emit: vi.fn() }),
} as never

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    type: "cart.item_updated",
    payload: { sku: "ABC", qty: 2 },
    timestamp: new Date().toISOString(),
    nonce: "nonce-1",
    signature: "firma-1",
    ...overrides,
  }
}

let server: Server
let baseUrl: string

beforeAll(async () => {
  __setDenyRedisForTests({ get: async () => null, set: async () => "OK" })

  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as { id?: string }).id = "req-test"
    next()
  })
  app.use(authMiddleware)
  app.use("/sync", syncRouter(fakeIo))

  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  const port = typeof address === "object" && address ? address.port : 0
  baseUrl = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  __setDenyRedisForTests(null)
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
})

beforeEach(() => {
  __resetJtiDenylistForTests()
  vi.mocked(getDeviceSecret).mockReset()
  vi.mocked(validateEvent).mockReset()
})

async function postReplay(events: unknown[]): Promise<Response> {
  const token = signJwt(basePayload, PRIVATE_PEM, 10 * 60 * 1000)
  return fetch(`${baseUrl}/sync/replay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ events }),
  })
}

describe("POST /sync/replay — deviceSecret fail-closed", () => {
  it("sin deviceSecret: 400 missing_device_secret y NO valida firmas", async () => {
    vi.mocked(getDeviceSecret).mockResolvedValue(null)

    const res = await postReplay([makeEvent()])

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("Device secret not configured")
    expect(body.eventsFallidos).toEqual([
      { id: "evt-1", reason: "missing_device_secret" },
    ])
    expect(validateEvent).not.toHaveBeenCalled()
  })

  it("con deviceSecret: valida cada evento (regresión del salto)", async () => {
    vi.mocked(getDeviceSecret).mockResolvedValue("secreto-del-tenant")
    vi.mocked(validateEvent).mockResolvedValue({ valid: true })

    const res = await postReplay([makeEvent()])

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.eventsProcessed).toBe(1)
    expect(validateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt-1" }),
      "secreto-del-tenant",
      basePayload.tenantId
    )
  })

  it("firma inválida con secreto presente: 400 con el motivo", async () => {
    vi.mocked(getDeviceSecret).mockResolvedValue("secreto-del-tenant")
    vi.mocked(validateEvent).mockResolvedValue({ valid: false, reason: "bad signature" })

    const res = await postReplay([makeEvent()])

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("Event signature validation failed")
    expect(body.eventsFallidos).toEqual([{ id: "evt-1", reason: "bad signature" }])
  })
})
