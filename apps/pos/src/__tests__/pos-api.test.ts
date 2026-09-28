import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

import { posApi, PosApiError, isPosApiError, SESSION_CACHE_KEY } from "../services/pos-api"
import { fetchMenuSnapshot } from "../services/menu"

/**
 * M5 — el cliente HTTP de la superficie /api/[tenant]/pos/*.
 *
 * Es el único punto donde el POS decide cómo hablar con el SaaS, así que
 * cualquier regla de aquí (sede, token, errores tipados) vale para todos los
 * servicios a la vez. Si este archivo queda verde, ningún servicio puede
 * "olvidarse" del header de sede ni parsear mensajes humanos.
 */

const TENANT = "64b000000000000000000001"
const LOCATION = "64b0000000000000000000f1"
const BASE = "http://saas.test"

const fetchMock = vi.fn()
const dispatchEventMock = vi.fn()

// vi.mock se izquierda arriba de todo: el factory no puede tocar un `const`
// declarado más abajo (TDZ). vi.hoisted corre antes que el import.
const configGetMock = vi.hoisted(() => vi.fn())

vi.mock("../db/dexie", () => ({
  db: {
    tenantConfig: {
      get: (...args: unknown[]) => configGetMock(...args),
    },
  },
}))

function stubSession(accessToken: string | null): void {
  const store = new Map<string, string>()
  if (accessToken) {
    store.set(
      SESSION_CACHE_KEY,
      JSON.stringify({ accessToken, expiresAt: 1, tenantId: TENANT })
    )
  }
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

let originalSaasUrl: string | undefined

beforeEach(() => {
  originalSaasUrl = import.meta.env.VITE_SAAS_URL
  import.meta.env.VITE_SAAS_URL = BASE

  fetchMock.mockReset()
  configGetMock.mockReset()
  configGetMock.mockResolvedValue({ locationId: LOCATION })

  stubSession("jwt-de-prueba")
  vi.stubGlobal("fetch", fetchMock)
  vi.stubGlobal("window", { dispatchEvent: dispatchEventMock })
})

afterEach(() => {
  import.meta.env.VITE_SAAS_URL = originalSaasUrl
  vi.unstubAllGlobals()
})

function lastFetch(): { url: string; init: RequestInit } {
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return { url, init }
}

function headers(init: RequestInit): Record<string, string> {
  return (init.headers ?? {}) as Record<string, string>
}

describe("posApi — construcción de la petición", () => {
  it("arma la URL del SaaS con tenant y path, y manda token + sede", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))

    const body = await posApi<{ ok: boolean }>(TENANT, "/tables")

    const call = lastFetch()
    expect(call.url).toBe(`${BASE}/api/${TENANT}/pos/tables`)
    expect(call.init.method).toBe("GET")
    expect(headers(call.init).Authorization).toBe("Bearer jwt-de-prueba")
    expect(headers(call.init)["X-Location-Id"]).toBe(LOCATION)
    expect(call.init.body).toBeUndefined()
    expect(body).toEqual({ ok: true })
  })

  it("serializa body, método, Idempotency-Key y query params", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))

    await posApi(TENANT, "/orders", {
      method: "POST",
      body: { id: "abc", items: [] },
      idempotencyKey: "abc",
      query: { limit: 500, status: "open", empty: undefined },
    })

    const call = lastFetch()
    expect(call.init.method).toBe("POST")
    expect(headers(call.init)["Content-Type"]).toBe("application/json")
    expect(headers(call.init)["Idempotency-Key"]).toBe("abc")
    expect(call.init.body).toBe(JSON.stringify({ id: "abc", items: [] }))
    expect(call.url).toBe(`${BASE}/api/${TENANT}/pos/orders?limit=500&status=open`)
  })

  it("sin locationId en Dexie no manda el header (el server aplica single-sede)", async () => {
    configGetMock.mockResolvedValue(undefined)
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))

    await posApi(TENANT, "/tables")

    expect(headers(lastFetch().init)["X-Location-Id"]).toBeUndefined()
  })

  it("sin VITE_SAAS_URL falla con un error claro, no con un URL roto", async () => {
    vi.stubEnv("VITE_SAAS_URL", "")

    const err = await posApi(TENANT, "/tables").catch((e) => e)
    if (!isPosApiError(err)) console.error("[diagnóstico] error inesperado:", err)
    expect(isPosApiError(err)).toBe(true)
    expect((err as PosApiError).code).toBe("internal")
    expect((err as PosApiError).message).toContain("VITE_SAAS_URL")
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})

describe("posApi — errores", () => {
  it("traduce el error tipado del server (code, status, detail)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "transition_invalid",
            message: "Transición no permitida: free → closed",
            detail: "Allowed: [occupied, reserved]",
          },
        },
        409
      )
    )

    const err = await posApi(TENANT, "/tables/1", { method: "PATCH" }).catch((e) => e)
    expect(isPosApiError(err)).toBe(true)
    expect((err as PosApiError).code).toBe("transition_invalid")
    expect((err as PosApiError).status).toBe(409)
    expect((err as PosApiError).detail).toBe("Allowed: [occupied, reserved]")
    expect((err as PosApiError).message).toBe(
      "Transición no permitida: free → closed"
    )
  })

  it("un 401 además dispara auth:expired (como checkAuth de sync-api)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "unauthorized", message: "No autenticado" } }, 401)
    )

    const err = await posApi(TENANT, "/tables").catch((e) => e)
    expect((err as PosApiError).code).toBe("unauthorized")
    expect(dispatchEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "auth:expired" })
    )
  })

  it("respuesta sin JSON conserva un mensaje genérico", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("no json")
      },
    } as unknown as Response)

    const err = await posApi(TENANT, "/tables").catch((e) => e)
    expect((err as PosApiError).code).toBe("internal")
    expect((err as PosApiError).status).toBe(502)
    expect((err as PosApiError).message).toContain("502")
  })

  it("falla de red → code network", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))

    const err = await posApi(TENANT, "/tables").catch((e) => e)
    expect((err as PosApiError).code).toBe("network")
    expect((err as PosApiError).message).toBe("Failed to fetch")
  })

  it("sin sesión en sessionStorage → no_session, sin pegarle al server", async () => {
    stubSession(null)

    const err = await posApi(TENANT, "/tables").catch((e) => e)
    expect((err as PosApiError).code).toBe("no_session")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("fetchMenuSnapshot", () => {
  it("lee el menú por /pos/menu con el token que le pasó el hook", async () => {
    const snapshot = {
      version: 1,
      tenantId: TENANT,
      products: [],
      categories: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      signature: "abc",
      serverTime: "2026-01-01T00:00:01.000Z",
    }
    fetchMock.mockResolvedValue(jsonResponse(snapshot))

    const result = await fetchMenuSnapshot(TENANT, "jwt-del-hook")

    expect(lastFetch().url).toBe(`${BASE}/api/${TENANT}/pos/menu`)
    expect(headers(lastFetch().init).Authorization).toBe("Bearer jwt-del-hook")
    expect(result.signature).toBe("abc")
    expect(result.products).toEqual([])
  })

  it("propaga el error tipado (useMenu decide si muestra o usa el cache)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "forbidden", message: "Acceso denegado" } }, 403)
    )

    const err = await fetchMenuSnapshot(TENANT, "jwt-del-hook").catch((e) => e)
    expect(isPosApiError(err)).toBe(true)
    expect((err as PosApiError).code).toBe("forbidden")
  })
})
