import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest"
import express from "express"
import type { Server } from "node:http"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { generateKeyPairSync, createSign } from "node:crypto"
import { signJwt } from "@takeasygo/business/jwt"
import { authMiddleware } from "../src/auth/middleware"
import { logoutRouter } from "../src/routes/auth"
import {
  logoutIpRateLimiter,
  checkLogoutSubLimit,
  __resetLogoutLimitersForTests,
} from "../src/middleware/rate-limiter"
import {
  isJtiDenied,
  denyJti,
  flushPendingWrites,
  MAX_PENDING_DENY_WRITES,
  __setDenyRedisForTests,
  __resetJtiDenylistForTests,
  __getPendingDenyWritesForTests,
  type DenyRedisLike,
} from "../src/auth/jtiDenylist"

/**
 * S1-5 — Revocación de tokens en logout (sync side).
 *
 * Cubre el camino real: POST /auth/logout con Bearer válido → el jti queda
 * en la denylist → el MISMO token deja de pasar authMiddleware en cualquier
 * OTRO endpoint (401). El propio logout es idempotente (r3): vuelve a 200,
 * o 503 si Redis no confirma — nunca 401 por un veto previo.
 * Redis se inyecta falso: sin servidor, sin handles colgados.
 *
 * Los tokens se firman con apps/sync/keys.private.pem — la MISMA clave con
 * la que config.ts (fallback de keys.public.pem) verifica en este entorno.
 */

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

function fakeRedis(overrides: Partial<DenyRedisLike> = {}): DenyRedisLike {
  return { get: async () => null, set: async () => "OK", ...overrides }
}

function mockRes() {
  const res: {
    status: ReturnType<typeof vi.fn>
    json: ReturnType<typeof vi.fn>
    statusCode?: number
  } = {} as never
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn(() => res)
  return res
}

function runMiddleware(headers: Record<string, string | undefined>) {
  const req = {
    headers,
    path: "/test",
    id: "req-test",
  } as never
  const res = mockRes()
  let nexted = false
  let nextErr: unknown = undefined
  return authMiddleware(req, res, (err?: unknown) => {
    nexted = true
    nextErr = err
  }).then(() => ({ res, nexted, nextErr, req }))
}

let server: Server
let baseUrl: string

beforeAll(async () => {
  __setDenyRedisForTests(fakeRedis())

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
  __setDenyRedisForTests(fakeRedis())
  __resetLogoutLimitersForTests()
})

afterEach(() => {
  __resetJtiDenylistForTests()
})

async function postLogout(token: string | null): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token !== null) headers.Authorization = `Bearer ${token}`
  return fetch(`${baseUrl}/auth/logout`, { method: "POST", headers })
}

describe("denylist (jtiDenylist)", () => {
  it("denyJti lo marca como denegado y el paso del tiempo lo libera", async () => {
    await denyJti("jti-a", 300)
    expect(await isJtiDenied("jti-a")).toBe(true)

    // Expira el veto (no el token): el jti vuelve a ser válido.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(Date.now() + 301_000)
    try {
      expect(await isJtiDenied("jti-a")).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it("FAIL-OPEN: si Redis no responde al consultar, no bloquea (devuelve false)", async () => {
    __setDenyRedisForTests(
      fakeRedis({
        get: async () => {
          throw new Error("ECONNREFUSED")
        },
      })
    )
    expect(await isJtiDenied("jti-x")).toBe(false)
  })

  it("si Redis falla al revocar, devuelve false (para el 503) y el veto queda en memoria local", async () => {
    __setDenyRedisForTests(
      fakeRedis({
        set: async () => {
          throw new Error("ECONNREFUSED")
        },
      })
    )
    await expect(denyJti("jti-y", 300)).resolves.toBe(false)
    expect(await isJtiDenied("jti-y")).toBe(true)
  })

  it("los jti de otros tokens no se ven afectados", async () => {
    await denyJti("jti-1", 300)
    expect(await isJtiDenied("jti-1")).toBe(true)
    expect(await isJtiDenied("jti-2")).toBe(false)
  })
})

describe("authMiddleware con denylist", () => {
  it("token válido con jti pasa y expone jti/exp en req.auth", async () => {
    const token = signJwt(basePayload, PRIVATE_PEM)
    const { res, nexted, nextErr, req } = await runMiddleware({
      authorization: `Bearer ${token}`,
    })
    expect(nexted).toBe(true)
    expect(nextErr).toBeUndefined()
    expect(res.status).not.toHaveBeenCalled()
    const auth = (req as { auth?: { jti: string; exp: number } }).auth
    expect(auth?.jti).toBeTruthy()
    expect(typeof auth?.exp).toBe("number")
  })

  it("REVOCADO: con el jti en la denylist devuelve 401 y NO llama next()", async () => {
    const token = signJwt(basePayload, PRIVATE_PEM)
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf-8")
    ) as { jti: string }
    await denyJti(payload.jti, 300)

    const { res, nexted } = await runMiddleware({
      authorization: `Bearer ${token}`,
    })
    expect(res.status).toHaveBeenCalledWith(401)
    expect(nexted).toBe(false)
  })

  it("FAIL-CLOSED (jti): token válido SIN jti → 401 (pre-S1-5 no es revocable)", async () => {
    const now = Math.floor(Date.now() / 1000)
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url")
    const data = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
      ...basePayload,
      iat: now,
      exp: now + 600,
    })}`
    const sig = createSign("RSA-SHA256").update(data).sign(PRIVATE_PEM, "base64url")
    const token = `${data}.${sig}`

    const { res, nexted } = await runMiddleware({
      authorization: `Bearer ${token}`,
    })
    expect(res.status).toHaveBeenCalledWith(401)
    expect(nexted).toBe(false)
  })

  it("regresión: sin header sigue dando 401", async () => {
    const { res, nexted } = await runMiddleware({})
    expect(res.status).toHaveBeenCalledWith(401)
    expect(nexted).toBe(false)
  })

  it("r3 — LOGOUT idempotente: POST /auth/logout con jti ya vetado pasa al next()", async () => {
    const token = signJwt(basePayload, PRIVATE_PEM)
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf-8")
    ) as { jti: string }
    await denyJti(payload.jti, 300)

    const req = {
      headers: { authorization: `Bearer ${token}` },
      path: "/api/v1/auth/logout",
      id: "req-test",
      method: "POST",
      originalUrl: "/api/v1/auth/logout",
    } as never
    const res = mockRes()
    let nexted = false
    await authMiddleware(req, res, () => {
      nexted = true
    })
    expect(nexted).toBe(true)
    expect(res.status).not.toHaveBeenCalled()
  })

  it("r3 — el bypass es SOLO logout: otro POST con el mismo jti vetado → 401", async () => {
    const token = signJwt(basePayload, PRIVATE_PEM)
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf-8")
    ) as { jti: string }
    await denyJti(payload.jti, 300)

    const req = {
      headers: { authorization: `Bearer ${token}` },
      path: "/api/v1/orders",
      id: "req-test",
      method: "POST",
      originalUrl: "/api/v1/orders",
    } as never
    const res = mockRes()
    let nexted = false
    await authMiddleware(req, res, () => {
      nexted = true
    })
    expect(res.status).toHaveBeenCalledWith(401)
    expect(nexted).toBe(false)
  })
})

describe("POST /auth/logout (e2e middleware + ruta)", () => {
  it("200 y el segundo logout con el MISMO token es idempotente (r3)", async () => {
    const token = signJwt(basePayload, PRIVATE_PEM, 10 * 60 * 1000)

    // Pasa el middleware antes de revocar.
    const before = await postLogout(token)
    expect(before.status).toBe(200)
    expect(await before.json()).toEqual({ revoked: true })

    // El jti quedó en la denylist...
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf-8")
    ) as { jti: string }
    expect(await isJtiDenied(payload.jti)).toBe(true)

    // ...el mismo token sigue muriendo en el middleware para CUALQUIER
    // otro endpoint, pero el logout lo deja pasar (r3): reescribe la
    // escritura durable y responde 200, nunca 401 por veto previo.
    const again = await postLogout(token)
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ revoked: true })
  })

  it("401 sin header", async () => {
    expect((await postLogout(null)).status).toBe(401)
  })

  it("401 con firma inválida", async () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 })
    const token = signJwt(
      basePayload,
      other.privateKey.export({ type: "pkcs8", format: "pem" }) as string
    )
    expect((await postLogout(token)).status).toBe(401)
  })

  it("revocar un token deja a los demás intactos", async () => {
    const revoked = signJwt(basePayload, PRIVATE_PEM, 10 * 60 * 1000)
    const other = signJwt(basePayload, PRIVATE_PEM, 10 * 60 * 1000)

    expect((await postLogout(revoked)).status).toBe(200)
    expect((await postLogout(other)).status).toBe(200)
  })
})

describe("503 si la denylist no confirma (G2 — defecto 1)", () => {
  it("POST /auth/logout contesta 503 code=revoke_unavailable con Redis caído", async () => {
    __setDenyRedisForTests(
      fakeRedis({
        set: async () => {
          throw new Error("ECONNREFUSED")
        },
      })
    )
    const token = signJwt(basePayload, PRIVATE_PEM, 10 * 60 * 1000)

    const res = await postLogout(token)
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: "revoke_unavailable" })

    // La memoria local de ESTE proceso quedó cubierta, pero el logout es
    // idempotente (r3): reintenta la escritura durable y, con Redis caído,
    // contesta 503 — NUNCA 401 por un veto que ya estaba aplicado.
    const after = await postLogout(token)
    expect(after.status).toBe(503)
    expect(await after.json()).toMatchObject({ code: "revoke_unavailable" })
  })
})

describe("rate limit de logout (G2 — defecto 4)", () => {
  function limiterReq(ip: string) {
    return { ip } as never
  }

  it("por IP: 60/min; el 61º request da 429 (antes de verificar)", () => {
    const next = vi.fn()
    for (let i = 0; i < 60; i++) {
      const res = mockRes()
      logoutIpRateLimiter(limiterReq("203.0.113.9"), res as never, next)
      expect(res.statusCode).toBeUndefined()
    }
    expect(next).toHaveBeenCalledTimes(60)

    const res = mockRes()
    logoutIpRateLimiter(limiterReq("203.0.113.9"), res as never, next)
    expect(res.statusCode).toBe(429)
    expect(next).toHaveBeenCalledTimes(60)
  })

  it("por sub: 20/min; el 21º intento da false (después de verificar)", () => {
    for (let i = 0; i < 20; i++) {
      expect(checkLogoutSubLimit("sub-limite")).toBe(true)
    }
    expect(checkLogoutSubLimit("sub-limite")).toBe(false)
    // Otra sub no arrastra el contador.
    expect(checkLogoutSubLimit("sub-otra")).toBe(true)
  })
})

function statefulRedis(): DenyRedisLike & {
  store: Map<string, string>
  setDown(down: boolean): void
} {
  const store = new Map<string, string>()
  let down = false
  return {
    store,
    setDown(next: boolean) {
      down = next
    },
    get: async (key) => {
      if (down) throw new Error("ECONNREFUSED")
      return store.get(key) ?? null
    },
    set: async (key, value) => {
      if (down) throw new Error("ECONNREFUSED")
      store.set(key, value)
      return "OK"
    },
  }
}

describe("cola de escrituras pendientes (ronda 2 — defecto 1)", () => {
  it("Redis falla al revocar → en cola; flushPendingWrites la persiste al volver", async () => {
    const fake = statefulRedis()
    fake.setDown(true)
    __setDenyRedisForTests(fake)

    await expect(denyJti("jti-cola", 300)).resolves.toBe(false)
    expect(__getPendingDenyWritesForTests()).toEqual(["jti-cola"])

    fake.setDown(false)
    await flushPendingWrites()

    expect(__getPendingDenyWritesForTests()).toEqual([])
    // La autoridad entre instancias (Redis) quedó con el veto + TTL.
    expect(fake.store.get("jwtDeny:jti-cola")).toBe("1")
    expect(await isJtiDenied("jti-cola")).toBe(true)
  })

  it("el fallo arma el timer de reintento del proceso (5s)", async () => {
    vi.useFakeTimers()
    try {
      const fake = statefulRedis()
      fake.setDown(true)
      __setDenyRedisForTests(fake)

      await denyJti("jti-timer", 300)

      expect(__getPendingDenyWritesForTests()).toEqual(["jti-timer"])
      expect(vi.getTimerCount()).toBe(1)
    } finally {
      vi.useRealTimers()
      __resetJtiDenylistForTests()
      __setDenyRedisForTests(fakeRedis())
    }
  })

  it("un veto ya vencido en la cola no se reescribe (el token también venció)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      const fake = statefulRedis()
      fake.setDown(true)
      __setDenyRedisForTests(fake)

      await denyJti("jti-vence", 60)

      vi.setSystemTime(Date.now() + 61_000)
      fake.setDown(false)
      await flushPendingWrites()

      expect(__getPendingDenyWritesForTests()).toEqual([])
      expect(fake.store.has("jwtDeny:jti-vence")).toBe(false)
    } finally {
      vi.useRealTimers()
      __resetJtiDenylistForTests()
      __setDenyRedisForTests(fakeRedis())
    }
  })

  it("r3 — la cola tiene tope: nunca crece más allá de MAX_PENDING_DENY_WRITES", async () => {
    __setDenyRedisForTests(
      fakeRedis({
        set: async () => {
          throw new Error("ECONNREFUSED")
        },
      })
    )
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      for (let i = 0; i < MAX_PENDING_DENY_WRITES + 5; i++) {
        await denyJti(`jti-cap-${i}`, 300)
      }
      const pending = __getPendingDenyWritesForTests()
      expect(pending).toHaveLength(MAX_PENDING_DENY_WRITES)
      expect(pending).not.toContain("jti-cap-0") // el más viejo se expulsó
      expect(pending).toContain(`jti-cap-${MAX_PENDING_DENY_WRITES + 4}`)
      expect(
        errorSpy.mock.calls.some((c) => String(c[0]).includes("cola pendingWrites llena"))
      ).toBe(true)
    } finally {
      errorSpy.mockRestore()
      __resetJtiDenylistForTests()
      __setDenyRedisForTests(fakeRedis())
    }
  })
})

describe("logs rate-limitados (ronda 2 — defecto 4)", () => {
  it("con Redis caído: 1 log por minuto, no uno por verificación de token", async () => {
    __setDenyRedisForTests(
      fakeRedis({
        get: async () => {
          throw new Error("ECONNREFUSED")
        },
      })
    )
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      for (let i = 0; i < 50; i++) {
        await isJtiDenied(`jti-flood-${i}`)
      }
      const failOpenLogs = () =>
        errorSpy.mock.calls.filter((c) => String(c[0]).includes("fail-open"))
      expect(failOpenLogs()).toHaveLength(1)

      // Pasó el minuto: vuelve a loguear UNA vez.
      vi.setSystemTime(Date.now() + 61_000)
      await isJtiDenied("jti-flood-x")
      expect(failOpenLogs()).toHaveLength(2)
    } finally {
      vi.useRealTimers()
      errorSpy.mockRestore()
    }
  })

  it("r3 — throttle POR CATEGORÍA: el fallo de lectura no tapa el de escritura", async () => {
    __setDenyRedisForTests(
      fakeRedis({
        get: async () => {
          throw new Error("ECONNREFUSED")
        },
        set: async () => {
          throw new Error("ECONNREFUSED")
        },
      })
    )
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      await isJtiDenied("jti-r") // categoría "read" → fail-open
      await denyJti("jti-w", 300) // categoría "write" → cola
      const msgs = errorSpy.mock.calls.map((c) => String(c[0]))
      expect(msgs.some((m) => m.includes("fail-open"))).toBe(true)
      expect(msgs.some((m) => m.includes("cola de reintentos"))).toBe(true)
    } finally {
      vi.useRealTimers()
      errorSpy.mockRestore()
    }
  })
})
