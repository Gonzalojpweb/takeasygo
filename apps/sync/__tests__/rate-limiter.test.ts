import { describe, it, expect, vi, afterEach } from "vitest"
import {
  loginRateLimiter,
  recordLoginFailure,
  clearLoginFailures,
} from "../src/middleware/rate-limiter"
import { config } from "../src/config"

function mockRes() {
  const res: {
    status: ReturnType<typeof vi.fn>
    json: ReturnType<typeof vi.fn>
  } = {} as never
  res.status = vi.fn(() => res)
  res.json = vi.fn(() => res)
  return res
}

type Req = { ip?: string }
const req = (ip?: string): Req => ({ ip })

function check(ip?: string): { next: boolean; res: ReturnType<typeof mockRes> } {
  const res = mockRes()
  let next = false
  loginRateLimiter(req(ip) as never, res as never, () => {
    next = true
  })
  return { next, res }
}

describe("login rate limiter", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("deja pasar mientras no se alcance RATE_LIMIT_LOGIN fallos", () => {
    const ip = "10.11.0.1"
    clearLoginFailures(req(ip))

    for (let i = 0; i < config.rateLimitLogin - 1; i++) {
      recordLoginFailure(req(ip))
      expect(check(ip).next).toBe(true)
    }
  })

  it("corta con 429 al llegar al limite de fallos", () => {
    const ip = "10.11.0.2"
    clearLoginFailures(req(ip))

    for (let i = 0; i < config.rateLimitLogin; i++) recordLoginFailure(req(ip))

    const { next, res } = check(ip)
    expect(next).toBe(false)
    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "rate_limited" })
    )
  })

  it("una clave correcta limpia el contador de esa IP", () => {
    const ip = "10.11.0.3"
    for (let i = 0; i < config.rateLimitLogin; i++) recordLoginFailure(req(ip))
    expect(check(ip).next).toBe(false)

    clearLoginFailures(req(ip))

    expect(check(ip).next).toBe(true)
  })

  it("el bloqueo es por IP: otra IP no se ve afectada", () => {
    const blocked = "10.11.0.4"
    const other = "10.11.0.5"
    for (let i = 0; i < config.rateLimitLogin; i++) recordLoginFailure(req(blocked))

    expect(check(blocked).next).toBe(false)
    expect(check(other).next).toBe(true)
    clearLoginFailures(req(blocked))
  })

  it("con IP ausente no revienta (clave unknown)", () => {
    clearLoginFailures(req(undefined))
    recordLoginFailure(req(undefined))
    expect(check(undefined).next).toBe(true)
    clearLoginFailures(req(undefined))
  })

  it("el contador vuelve a cero al cumplirse la ventana", () => {
    const ip = "10.11.0.6"
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))

    for (let i = 0; i < config.rateLimitLogin; i++) recordLoginFailure(req(ip))
    expect(check(ip).next).toBe(false)

    vi.setSystemTime(new Date("2026-01-01T00:01:01Z"))
    expect(check(ip).next).toBe(true)
    clearLoginFailures(req(ip))
  })
})
