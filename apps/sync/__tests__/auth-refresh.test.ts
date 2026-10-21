import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import express from "express"
import type { Server } from "node:http"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { signJwt, decodeJwt, HUB_SESSION_MAX_AGE_MS } from "@takeasygo/business/jwt"
import { UserModel, LocationModel } from "@takeasygo/db"
import "./setup"
import { authMiddleware } from "../src/auth/middleware"
import { logoutRouter } from "../src/routes/auth"
import { __resetLogoutLimitersForTests } from "../src/middleware/rate-limiter"
import {
  isJtiDenied,
  __setDenyRedisForTests,
  __resetJtiDenylistForTests,
} from "../src/auth/jtiDenylist"

/**
 * Auditoría POS Online V1 §1.4 — refresh del token del hub.
 *
 * El token vive 30 min; sin refresh el cajero perdía la sesión a mitad de
 * turno. POST /auth/refresh renueva SIN pedir el PIN pero:
 *   · re-valida usuario activo, rol con acceso al POS y sede activa;
 *   · arrastra authTime y corta en HUB_SESSION_MAX_AGE_MS (16 h);
 *   · rota: el jti anterior queda vetado.
 */

const PRIVATE_PEM = readFileSync(
  fileURLToPath(new URL("../keys.private.pem", import.meta.url)),
  "utf-8"
).trim()

let server: Server
let baseUrl: string
let userId: string
let tenantId: string
let locationId: string

beforeAll(async () => {
  __setDenyRedisForTests({ get: async () => null, set: async () => "OK" })
  const app = express()
  app.use((req, _res, next) => {
    ;(req as { id?: string }).id = "req-test"
    next()
  })
  app.use(authMiddleware)
  app.use("/auth", logoutRouter)
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`
})

afterAll(async () => {
  __setDenyRedisForTests(null)
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

beforeEach(async () => {
  __resetJtiDenylistForTests()
  __resetLogoutLimitersForTests()
  tenantId = "64b0000000000000000000b2"
  const loc = await LocationModel.create({ tenantId, name: "Centro", isActive: true, status: "active" })
  locationId = loc._id.toString()
  const user = await UserModel.create({
    name: "Cajera",
    email: `cajera-${Math.random().toString(36).slice(2)}@test.com`,
    role: "cashier",
    tenantId,
    isActive: true,
  })
  userId = user._id.toString()
})

function token(overrides: Record<string, unknown> = {}): string {
  return signJwt(
    {
      sub: userId,
      tenantId,
      role: "cashier",
      deviceType: "hub",
      locationId,
      authTime: Math.floor(Date.now() / 1000),
      ...overrides,
    } as Parameters<typeof signJwt>[0],
    PRIVATE_PEM
  )
}

function refresh(t: string): Promise<Response> {
  return fetch(`${baseUrl}/auth/refresh`, { method: "POST", headers: { Authorization: `Bearer ${t}` } })
}

describe("POST /auth/refresh", () => {
  it("emite un token nuevo con los mismos claims y authTime, y veta el anterior", async () => {
    const original = token()
    const res = await refresh(original)
    expect(res.status).toBe(200)
    const body = await res.json()

    const oldPayload = decodeJwt(original)!
    const newPayload = decodeJwt(body.accessToken)!
    expect(newPayload.sub).toBe(userId)
    expect(newPayload.tenantId).toBe(tenantId)
    expect(newPayload.locationId).toBe(locationId)
    expect(newPayload.authTime).toBe(oldPayload.authTime)
    expect(newPayload.jti).not.toBe(oldPayload.jti)
    expect(body.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000))

    expect(await isJtiDenied(oldPayload.jti!)).toBe(true)
    // El token viejo ya no sirve ni para refrescar.
    expect((await refresh(original)).status).toBe(401)
  })

  it("usuario dado de baja → 401", async () => {
    await UserModel.updateOne({ _id: userId }, { isActive: false })
    expect((await refresh(token())).status).toBe(401)
  })

  it("sede pausada → 401 location_inactive", async () => {
    await LocationModel.updateOne({ _id: locationId }, { status: "paused" })
    const res = await refresh(token())
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe("location_inactive")
  })

  it("sesión más vieja que el tope absoluto → 401 session_max_age", async () => {
    const authTime = Math.floor((Date.now() - HUB_SESSION_MAX_AGE_MS) / 1000) - 60
    const res = await refresh(token({ authTime }))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe("session_max_age")
  })

  it("usuario de OTRO tenant con el mismo sub → 401", async () => {
    const res = await refresh(token({ tenantId: "64b0000000000000000000ff", locationId: undefined }))
    expect(res.status).toBe(401)
  })

  it("sin token → 401", async () => {
    const res = await fetch(`${baseUrl}/auth/refresh`, { method: "POST" })
    expect(res.status).toBe(401)
  })
})
