import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Socket } from "socket.io"
import type { JwtPayload } from "@takeasygo/types"
import {
  registerSocket,
  sweepSockets,
  __resetSocketRegistryForTests,
} from "../src/socket/registry"

/**
 * S1-5 ronda 2 — defecto 3: barrido SERVER-SIDE de sockets.
 *
 * El disconnect directo en logout y el re-chequeo por heartbeat dependen de
 * que el cliente vuelva a hablar (o de que la petición de logout llegue a
 * este proceso). El barrido cada 30s tumba, sin pedir permiso:
 *  - sockets cuyo token ya venció;
 *  - sockets cuyo jti está en la denylist.
 * Un cliente comprometido que no emite pings no sobrevive a su token.
 */

function fakeSocket() {
  return { disconnect: vi.fn() } as unknown as Socket
}

function authNow(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: "64b0000000000000000000a1",
    tenantId: "64b0000000000000000000b2",
    role: "cashier",
    deviceType: "hub",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  }
}

beforeEach(() => {
  __resetSocketRegistryForTests()
})

describe("sweepSockets (barrido server-side)", () => {
  it("token vencido → se tumba SIN llegar a consultar la denylist", async () => {
    const socket = fakeSocket()
    registerSocket("jti-exp", socket, authNow({ exp: 1000 })) // vencido hace rato

    const isDenied = vi.fn(async () => false)
    const result = await sweepSockets(isDenied)

    expect(result).toEqual({ expired: 1, denied: 0 })
    expect(socket.disconnect).toHaveBeenCalledWith(true)
    expect(isDenied).not.toHaveBeenCalled()
  })

  it("token vigente pero jti revocado → se tumba por denylist", async () => {
    const socket = fakeSocket()
    registerSocket("jti-deny", socket, authNow())

    const result = await sweepSockets(async () => true)

    expect(result).toEqual({ expired: 0, denied: 1 })
    expect(socket.disconnect).toHaveBeenCalledWith(true)
  })

  it("token vigente y no revocado → queda conectado", async () => {
    const socket = fakeSocket()
    registerSocket("jti-ok", socket, authNow())

    const result = await sweepSockets(async () => false)

    expect(result).toEqual({ expired: 0, denied: 0 })
    expect(socket.disconnect).not.toHaveBeenCalled()
  })

  it("si la denylist no responde → fail-open, el socket queda para el próximo barrido", async () => {
    const socket = fakeSocket()
    registerSocket("jti-down", socket, authNow())

    const result = await sweepSockets(async () => {
      throw new Error("ECONNREFUSED")
    })

    expect(result).toEqual({ expired: 0, denied: 0 })
    expect(socket.disconnect).not.toHaveBeenCalled()
  })

  it("ya caído no se repite: el segundo barrido no lo vuelve a tocar", async () => {
    const socket = fakeSocket()
    registerSocket("jti-2", socket, authNow({ exp: 1000 }))

    const first = await sweepSockets(async () => false)
    expect(first.expired).toBe(1)

    const second = await sweepSockets(async () => false)
    expect(second).toEqual({ expired: 0, denied: 0 })
    expect(socket.disconnect).toHaveBeenCalledTimes(1)
  })

  it("lote mixto: devuelve cuántos por expiración y cuántos por veto", async () => {
    const s1 = fakeSocket() // vigente + revocado
    const s2 = fakeSocket() // vencido
    const s3 = fakeSocket() // vigente + libre
    registerSocket("jti-vigente-revocado", s1, authNow())
    registerSocket("jti-vencido", s2, authNow({ exp: 1000 }))
    registerSocket("jti-libre", s3, authNow())

    const checked: string[] = []
    const result = await sweepSockets(async (jti) => {
      checked.push(jti)
      return jti === "jti-vigente-revocado"
    })

    expect(result).toEqual({ expired: 1, denied: 1 })
    expect(s1.disconnect).toHaveBeenCalledTimes(1)
    expect(s2.disconnect).toHaveBeenCalledTimes(1)
    expect(s3.disconnect).not.toHaveBeenCalled()
    // Solo al vigente se le preguntó por la denylist (el vencido ni llega).
    expect(checked).toEqual(["jti-vigente-revocado", "jti-libre"])
  })

  it("r3 — anti-solapamiento: si un barrido sigue en vuelo, el siguiente se saltea", async () => {
    const socket = fakeSocket()
    registerSocket("jti-lento", socket, authNow()) // vigente → consulta denylist

    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    // Barrido 1: queda esperando dentro de isDenied (Redis congesto).
    const first = sweepSockets(async () => {
      await gate
      return false
    })

    // Barrido 2 mientras el 1 sigue en vuelo: no toca nada.
    const second = await sweepSockets(async () => true)
    expect(second).toEqual({ expired: 0, denied: 0 })
    expect(socket.disconnect).not.toHaveBeenCalled()

    release()
    expect(await first).toEqual({ expired: 0, denied: 0 })
    expect(socket.disconnect).not.toHaveBeenCalled()

    // Flag liberado: el siguiente barrido opera con normalidad.
    const third = await sweepSockets(async () => true)
    expect(third).toEqual({ expired: 0, denied: 1 })
    expect(socket.disconnect).toHaveBeenCalledTimes(1)
  })
})
