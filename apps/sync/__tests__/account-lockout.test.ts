import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import type Redis from "ioredis"
import {
  checkAccountLock,
  recordAccountFailure,
  clearAccountFailures,
  __setAccountLockRedisForTests,
} from "../src/middleware/rate-limiter"
import { config } from "../src/config"

/**
 * S1-3 — Lockout por cuenta en Redis (negativos).
 *
 * El bucket por IP (rate-limiter.test.ts) no alcanza: un atacante con
 * credenciales filtradas puede probar desde otra red. Acá la identidad de
 * cuenta (email / usuario PIN) comparte el castigo entre instancias.
 */

class FakeRedis {
  private store = new Map<string, { value: number | string; expiresAt?: number }>()

  clear(): void {
    this.store.clear()
  }

  private live(key: string) {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry
  }

  async ttl(key: string): Promise<number> {
    const entry = this.live(key)
    if (!entry) return -2
    if (entry.expiresAt === undefined) return -1
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000))
  }

  async incr(key: string): Promise<number> {
    const entry = this.live(key)
    if (!entry) {
      this.store.set(key, { value: 1 })
      return 1
    }
    if (typeof entry.value !== "number") throw new Error("WRONGTYPE")
    entry.value += 1
    return entry.value
  }

  async expire(key: string, seconds: string | number): Promise<number> {
    const entry = this.live(key)
    if (!entry) return 0
    entry.expiresAt = Date.now() + Number(seconds) * 1000
    return 1
  }

  async set(key: string, value: string, _ex?: string, seconds?: string | number): Promise<"OK"> {
    this.store.set(key, {
      value,
      ...(seconds !== undefined ? { expiresAt: Date.now() + Number(seconds) * 1000 } : {}),
    })
    return "OK"
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0
    for (const key of keys) if (this.store.delete(key)) removed++
    return removed
  }
}

const fake = new FakeRedis()
const ACCT = "email:cajero@test.com"

beforeEach(() => {
  fake.clear()
  __setAccountLockRedisForTests(fake as unknown as Redis)
})

afterEach(() => {
  __setAccountLockRedisForTests(null)
  vi.useRealTimers()
})

describe("lockout por cuenta (Redis)", () => {
  it("5 fallos (límite) → la cuenta queda lockeada con la duración base", async () => {
    for (let i = 0; i < config.loginLockFailLimit; i++) {
      await recordAccountFailure(ACCT)
    }
    const locked = await checkAccountLock(ACCT)
    expect(locked).toBe(config.loginLockBaseS)
  })

  it("con menos fallos que el límite NO lockea", async () => {
    for (let i = 0; i < config.loginLockFailLimit - 1; i++) {
      await recordAccountFailure(ACCT)
    }
    expect(await checkAccountLock(ACCT)).toBe(0)
  })

  it("cada lock posterior duplica la espera, con tope en loginLockMaxS", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))

    const esperados: number[] = []
    for (let lockNo = 1; lockNo <= 7; lockNo++) {
      esperados.push(
        Math.min(config.loginLockBaseS * 2 ** (lockNo - 1), config.loginLockMaxS)
      )
      for (let i = 0; i < config.loginLockFailLimit; i++) {
        await recordAccountFailure(ACCT)
      }
      const locked = await checkAccountLock(ACCT)
      expect(locked).toBe(esperados[lockNo - 1])
      vi.advanceTimersByTime((locked + 1) * 1000)
    }
    // tope efectivo: ninguna duración supera el máximo
    for (const d of esperados) expect(d).toBeLessThanOrEqual(config.loginLockMaxS)
    expect(esperados[esperados.length - 1]).toBe(config.loginLockMaxS)
  })

  it("una cuenta lockeada NO arrastra a las demás", async () => {
    for (let i = 0; i < config.loginLockFailLimit; i++) {
      await recordAccountFailure(ACCT)
    }
    expect(await checkAccountLock(ACCT)).toBeGreaterThan(0)
    expect(await checkAccountLock("email:otra@test.com")).toBe(0)
    expect(await recordAccountFailure("email:otra@test.com")).toBeUndefined()
    expect(await checkAccountLock("email:otra@test.com")).toBe(0)
  })

  it("login exitoso limpia fallos, lock y progresión", async () => {
    for (let i = 0; i < config.loginLockFailLimit; i++) {
      await recordAccountFailure(ACCT)
    }
    expect(await checkAccountLock(ACCT)).toBeGreaterThan(0)

    await clearAccountFailures(ACCT)
    expect(await checkAccountLock(ACCT)).toBe(0)

    // la progresión también: el próximo lock vuelve a la base
    for (let i = 0; i < config.loginLockFailLimit; i++) {
      await recordAccountFailure(ACCT)
    }
    expect(await checkAccountLock(ACCT)).toBe(config.loginLockBaseS)
    await clearAccountFailures(ACCT)
  })

  it("la ventana expira: fallos viejos no lockean a los nuevos", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))

    for (let i = 0; i < config.loginLockFailLimit - 1; i++) {
      await recordAccountFailure(ACCT)
    }
    vi.advanceTimersByTime((config.loginLockWindowS + 1) * 1000)

    await recordAccountFailure(ACCT) // contador reiniciado: va por 1
    expect(await checkAccountLock(ACCT)).toBe(0)
  })

  it("mientras está lockeada no acumula fallos extra", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))

    for (let i = 0; i < config.loginLockFailLimit; i++) {
      await recordAccountFailure(ACCT)
    }
    const duracion = await checkAccountLock(ACCT)
    expect(duracion).toBe(config.loginLockBaseS)

    for (let i = 0; i < 3; i++) await recordAccountFailure(ACCT)

    vi.advanceTimersByTime((duracion + 1) * 1000)
    expect(await checkAccountLock(ACCT)).toBe(0)
  })

  it("Redis caído → fail-open: no lockea y no revienta", async () => {
    __setAccountLockRedisForTests(null)
    for (let i = 0; i < config.loginLockFailLimit * 2; i++) {
      await recordAccountFailure(ACCT)
    }
    expect(await checkAccountLock(ACCT)).toBe(0)
    await expect(clearAccountFailures(ACCT)).resolves.toBeUndefined()
  })
})
