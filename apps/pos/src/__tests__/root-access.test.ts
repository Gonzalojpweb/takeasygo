import { describe, it, expect } from "vitest"
import { loginErrorFrom, LoginError } from "../services/auth-api"
import { forgetRootUser, initialsOf, readRootMemory, roleLabelOf, writeRootMemory, type StorageLike } from "../services/root-memory"
import { formatCountdown, loginNoticeFor } from "../components/Root/loginMessages"
import { pinSlots, PIN_MAX, PIN_MIN } from "../components/Root/PinPad"
import { canSubmitAccess } from "../components/Root/AccessScreen"

/**
 * Root del POS (obs. UX 25/10 — pos-root-interface.html):
 *   · cada falla del login tiene un tipo (R5) y su copy propio; nunca el
 *     texto crudo del servidor;
 *   · el equipo recuerda comercio + último usuario (sin PIN ni token);
 *   · reglas del PIN y del botón Entrar.
 */

function memStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }
}

describe("errores de login tipados (R5)", () => {
  it("mapea cada respuesta del Sync a un tipo", () => {
    expect(loginErrorFrom(401, { error: "Invalid credentials" }).kind).toBe("credentials")
    const locked = loginErrorFrom(429, { code: "account_locked", retryAfter: 59.2 })
    expect(locked.kind).toBe("locked")
    expect(locked.retryAfter).toBe(60)
    expect(loginErrorFrom(429, null, "30").kind).toBe("rate_limited")
    expect(loginErrorFrom(429, null, "30").retryAfter).toBe(30)
    expect(loginErrorFrom(403, { code: "ROLE_NOT_ALLOWED" }).kind).toBe("role")
    expect(loginErrorFrom(400, { code: "INVALID_LOCATION" }).kind).toBe("location")
    expect(loginErrorFrom(502, null).kind).toBe("server")
    expect(loginErrorFrom(418, null).kind).toBe("unknown")
    expect(loginErrorFrom(401, null)).toBeInstanceOf(LoginError)
  })

  it("el copy nunca repite el texto crudo del servidor", () => {
    const kinds = ["network", "credentials", "locked", "rate_limited", "role", "location", "server", "unknown"] as const
    for (const kind of kinds) {
      for (const mode of ["pin", "email"] as const) {
        const n = loginNoticeFor({ kind, retryAfter: null }, mode)
        expect(n.title).not.toMatch(/invalid|credentials|error \d|401|403|429|jwt|tenant/i)
        expect(n.body.length).toBeGreaterThan(10)
      }
    }
    expect(loginNoticeFor({ kind: "credentials", retryAfter: null }, "pin").title).toBe("PIN incorrecto")
    expect(loginNoticeFor({ kind: "network", retryAfter: null }, "pin").autoRetry).toBe(true)
  })

  it("cuenta regresiva del bloqueo en m:ss", () => {
    expect(formatCountdown(60)).toBe("1:00")
    expect(formatCountdown(5)).toBe("0:05")
    expect(formatCountdown(-3)).toBe("0:00")
  })
})

describe("memoria del equipo (entrar es recordar)", () => {
  it("guarda comercio y último usuario; «Cambiar de usuario» olvida solo a la persona", () => {
    const s = memStorage()
    expect(readRootMemory(s)).toBeNull()
    writeRootMemory({ tenantId: "t1", tenantName: "Bodegón", user: { name: "María Sosa", role: "cashier", mode: "pin" }, locationId: "l1", locationName: "Salón", at: "x" }, s)
    expect(readRootMemory(s)?.user?.name).toBe("María Sosa")
    const after = forgetRootUser(s)
    expect(after?.user).toBeNull()
    expect(after?.tenantId).toBe("t1")
    // Nunca se guardan secretos.
    expect([...s.data.values()].join(" ")).not.toMatch(/pin":|password|accessToken/i)
  })

  it("datos corruptos o sin comercio ⇒ sin memoria; sin storage no rompe", () => {
    const s = memStorage()
    s.setItem("takeasygo-pos-root-memory", "{no-json")
    expect(readRootMemory(s)).toBeNull()
    s.setItem("takeasygo-pos-root-memory", JSON.stringify({ tenantName: "x" }))
    expect(readRootMemory(s)).toBeNull()
    expect(readRootMemory(null)).toBeNull()
    expect(() => writeRootMemory({ tenantId: "t", tenantName: "", user: null, locationId: null, locationName: null, at: "" }, null)).not.toThrow()
  })

  it("iniciales y rol legibles", () => {
    expect(initialsOf("María Sosa")).toBe("MS")
    expect(initialsOf("")).toBe("?")
    expect(roleLabelOf("waiter")).toBe("Mozo")
    expect(roleLabelOf(undefined)).toBe("Operador")
  })
})

describe("PIN y botón Entrar", () => {
  it("se ven al menos 6 puntos y como mucho 8 (el servidor acepta 4–8)", () => {
    expect(pinSlots(0)).toBe(6)
    expect(pinSlots(7)).toBe(7)
    expect(pinSlots(12)).toBe(PIN_MAX)
  })
  it("Entrar: PIN de 4+ dígitos con comercio conocido; email + contraseña", () => {
    expect(canSubmitAccess("pin", "123", "t1", "", "")).toBe(false)
    expect(canSubmitAccess("pin", "1".repeat(PIN_MIN), "t1", "", "")).toBe(true)
    expect(canSubmitAccess("pin", "123456", "", "", "")).toBe(false)
    expect(canSubmitAccess("email", "", "", "a@b.com", "")).toBe(false)
    expect(canSubmitAccess("email", "", "", "a@b.com", "secreto")).toBe(true)
  })
})
