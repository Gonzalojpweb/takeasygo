import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

import { revokeSession, __resetRevokeRetriesForTests } from "../services/auth-api"

/**
 * S1-5 — revokeSession: el logout del POS revoca el token en los DOS
 * verificadores (dual store):
 *   · sync → POST {VITE_SYNC_URL}/api/v1/auth/logout   (Redis local de EC2)
 *   · saas → POST {VITE_SAAS_URL}/api/auth/logout      (Upstash de Vercel)
 *
 * Es best-effort: NUNCA lanza. Un fallo de red no puede impedir que el
 * logout local continúe; lo que sí queda expuesto es un lado sin revocar.
 * Ese lado se reintenta EN MEMORIA (3 envíos, backoff ~10s/~30s): el
 * token jamás se persiste en localStorage u otro lado.
 */

const SYNC = "http://sync.test"
const SAAS = "http://saas.test"
const TOKEN = "jwt-de-prueba"

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

let originalSyncUrl: string | undefined
let originalSaasUrl: string | undefined

beforeEach(() => {
  originalSyncUrl = import.meta.env.VITE_SYNC_URL
  originalSaasUrl = import.meta.env.VITE_SAAS_URL
  import.meta.env.VITE_SYNC_URL = SYNC
  import.meta.env.VITE_SAAS_URL = SAAS

  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  __resetRevokeRetriesForTests()
  import.meta.env.VITE_SYNC_URL = originalSyncUrl
  import.meta.env.VITE_SAAS_URL = originalSaasUrl
  vi.unstubAllGlobals()
})

function calledUrls(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]))
}

describe("revokeSession", () => {
  it("revoca en sync y saas en paralelo, con el Bearer del token", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ revoked: true }))

    const result = await revokeSession(TOKEN)

    expect(result).toEqual({ sync: true, saas: true })
    expect(calledUrls()).toHaveLength(2)
    expect(calledUrls()).toContain(`${SYNC}/api/v1/auth/logout`)
    expect(calledUrls()).toContain(`${SAAS}/api/auth/logout`)

    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit
      expect(init.method).toBe("POST")
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
      expect(init.signal).toBeDefined()
    }
  })

  it("nunca lanza: si la red revienta en ambos lados, devuelve false/false", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))

    const result = await revokeSession(TOKEN)

    expect(result).toEqual({ sync: false, saas: false })
  })

  it("un lado caído no bloquea al otro (resultado mixto, sin excepción)", async () => {
    fetchMock.mockImplementation((url: string) =>
      url.startsWith(SYNC)
        ? Promise.reject(new TypeError("Failed to fetch"))
        : Promise.resolve(jsonResponse({ revoked: true }))
    )

    const result = await revokeSession(TOKEN)

    expect(result).toEqual({ sync: false, saas: true })
  })

  it("responde 401/404 igual cuenta como no revocado (res.ok false)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "No autorizado" }, 401))

    const result = await revokeSession(TOKEN)

    expect(result).toEqual({ sync: false, saas: false })
  })

  it("sin VITE_SAAS_URL solo intenta sync (dev sin saas levantado)", async () => {
    import.meta.env.VITE_SAAS_URL = ""
    fetchMock.mockResolvedValue(jsonResponse({ revoked: true }))

    const result = await revokeSession(TOKEN)

    expect(result.sync).toBe(true)
    expect(result.saas).toBe(false)
    expect(calledUrls()).toEqual([`${SYNC}/api/v1/auth/logout`])
  })

  it("sin VITE_SYNC_URL solo intenta saas", async () => {
    import.meta.env.VITE_SYNC_URL = ""
    fetchMock.mockResolvedValue(jsonResponse({ revoked: true }))

    const result = await revokeSession(TOKEN)

    expect(result.sync).toBe(false)
    expect(result.saas).toBe(true)
    expect(calledUrls()).toEqual([`${SAAS}/api/auth/logout`])
  })
})

describe("reintento en memoria (G2)", () => {
  it("reintenta SOLO el lado fallido y para cuando confirma", async () => {
    vi.useFakeTimers()
    try {
      fetchMock.mockImplementation((url: string) =>
        url.startsWith(SYNC)
          ? Promise.resolve(jsonResponse({ revoked: true }))
          : Promise.reject(new TypeError("Failed to fetch"))
      )

      const first = await revokeSession(TOKEN)
      expect(first).toEqual({ sync: true, saas: false })
      expect(fetchMock).toHaveBeenCalledTimes(2)

      // saas vuelve: el reintento a los ~10s solo toca saas.
      fetchMock.mockResolvedValue(jsonResponse({ revoked: true }))
      await vi.advanceTimersByTimeAsync(10_000)

      expect(fetchMock).toHaveBeenCalledTimes(3)
      expect(calledUrls()[2]).toBe(`${SAAS}/api/auth/logout`)

      // Confirmado: no quedan timers ni llamadas posteriores.
      await vi.advanceTimersByTimeAsync(120_000)
      expect(fetchMock).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
      __resetRevokeRetriesForTests()
    }
  })

  it("3 envíos como máximo (inmediato + ~10s + ~30s) y luego se rinde", async () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))

      await revokeSession(TOKEN) // intento 1 (ambos lados, 2 llamadas)
      await vi.advanceTimersByTimeAsync(10_000) // intento 2 (2 llamadas)
      await vi.advanceTimersByTimeAsync(30_000) // intento 3 (2 llamadas)
      expect(fetchMock).toHaveBeenCalledTimes(6)

      // Agotado: sin más reintentos y con error visible.
      await vi.advanceTimersByTimeAsync(120_000)
      expect(fetchMock).toHaveBeenCalledTimes(6)
      expect(
        errorSpy.mock.calls.some((c) => String(c[0]).includes("NO confirmada"))
      ).toBe(true)
    } finally {
      errorSpy.mockRestore()
      warnSpy.mockRestore()
      vi.useRealTimers()
      __resetRevokeRetriesForTests()
    }
  })

  it("sin URL configurada para un lado no reintenta ese lado", async () => {
    vi.useFakeTimers()
    try {
      import.meta.env.VITE_SAAS_URL = ""
      fetchMock.mockResolvedValue(jsonResponse({ revoked: true }))

      const result = await revokeSession(TOKEN)
      expect(result).toEqual({ sync: true, saas: false })
      expect(fetchMock).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(120_000)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
      __resetRevokeRetriesForTests()
    }
  })
})
