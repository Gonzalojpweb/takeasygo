import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react"
import type { ReactNode } from "react"
import {
  generateSalt,
  deriveSessionEncryptionKey,
  encryptStore,
} from "@takeasygo/business/browser"
import { db } from "../db/dexie"
import { setEncryptionKey } from "./useEncryptionKey"
import * as authApi from "../services/auth-api"
// Misma constante que usa el cliente /pos/* para leer la sesión: si cada uno
// tuviera la suya, un rename rompería la autenticación en silencio.
import { SESSION_CACHE_KEY } from "../services/pos-api"

// ============================================================================
// Token lifecycle constants
// ============================================================================
const TOKEN_WARNING_MS = 5 * 60 * 1000   // warn 5 minutes before expiry
const SESSION_CHECK_MS = 60 * 1000        // check every 60 seconds

// ============================================================================
// Shared auth state — single source of truth for all hooks
// ============================================================================

function generateDeviceSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1]
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"))
    return JSON.parse(json)
  } catch {
    return null
  }
}

function isJwtEncrypted(
  data: unknown
): data is { iv: string; ciphertext: string; version: number } {
  return (
    typeof data === "object" &&
    data !== null &&
    "iv" in data &&
    "ciphertext" in data
  )
}

export interface AuthState {
  status: "loading" | "login" | "authenticated" | "error"
  error?: string
  tenantId?: string
  jwt?: authApi.LoginResponse
}

export interface AuthContextValue {
  state: AuthState
  login: (mode: "pin" | "email", credentials: Record<string, string>) => Promise<void>
  logout: () => Promise<void>
}

function cacheSession(data: authApi.LoginResponse, tenantId: string) {
  try {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ ...data, tenantId }))
  } catch {}
}

function getCachedSession(): (authApi.LoginResponse & { tenantId: string }) | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data.accessToken || !data.expiresAt) return null
    if (Date.now() >= data.expiresAt) {
      sessionStorage.removeItem(SESSION_CACHE_KEY)
      return null
    }
    return data
  } catch {
    return null
  }
}

function clearCachedSession() {
  try { sessionStorage.removeItem(SESSION_CACHE_KEY) } catch {}
}

/**
 * Tablas de Dexie que se limpian al hacer logout (S1-5): son vistas y
 * cachés del turno/usuario — el próximo que entre no debe heredarlas.
 *
 * Las que SOBREVIVEN (y por qué):
 *  - tenantConfig      → identidad del dispositivo (tenantSalt, deviceSecret);
 *                        borrarla rompe la firma de eventos offline y el pareo.
 *  - pendingEvents     → eventos offline aún NO sincronizados: son ventas.
 *  - pendingMovements  → movimientos de caja huérfanos sin sincronizar.
 *  - pendingStatusUpdates → cambios de estado locales esperando su pedido.
 *  - cashRegister      → caja abierta: es estado operativo, no de sesión.
 *  - pairedSpokes      → pareja de dispositivos (identidad, no sesión).
 */
async function wipeLocalSessionData(): Promise<void> {
  await db.session.clear()
  await db.menuSnapshot.clear()
  await db.orders.clear()
  await db.commands.clear()
  await db.diningTable.clear()
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" })
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Token lifecycle timers ────────────────────────────────────────────
  const clearTimers = useCallback(() => {
    if (refreshTimerRef.current) { clearTimeout(refreshTimerRef.current); refreshTimerRef.current = null }
    if (sessionCheckRef.current) { clearInterval(sessionCheckRef.current); sessionCheckRef.current = null }
  }, [])

  const startTimers = useCallback((expiresAtMs: number) => {
    clearTimers()

    // Warn before expiry — dispatch event so UI can show re-login prompt
    const msUntilWarning = expiresAtMs - Date.now() - TOKEN_WARNING_MS
    if (msUntilWarning > 0) {
      refreshTimerRef.current = setTimeout(() => {
        window.dispatchEvent(new CustomEvent("auth:expiring"))
      }, msUntilWarning)
    } else if (expiresAtMs - Date.now() > 0) {
      // Already within warning window
      window.dispatchEvent(new CustomEvent("auth:expiring"))
    }

    // Hard check — force logout when expired
    sessionCheckRef.current = setInterval(() => {
      if (Date.now() >= expiresAtMs) {
        clearTimers()
        clearCachedSession()
        setState({ status: "login", error: "Sesión expirada, volvé a ingresar tu PIN" })
        window.dispatchEvent(new CustomEvent("auth:expired"))
      }
    }, SESSION_CHECK_MS)
  }, [clearTimers])

  // Start timers when state becomes authenticated
  useEffect(() => {
    if (state.status === "authenticated" && state.jwt?.expiresAt) {
      const expiresAtMs = state.jwt.expiresAt * 1000
      if (Date.now() >= expiresAtMs) {
        // Token already expired
        clearCachedSession()
        setState({ status: "login", error: "Sesión expirada, volvé a ingresar tu PIN" })
      } else {
        startTimers(expiresAtMs)
      }
    }
    return clearTimers
  }, [state.status, state.jwt?.expiresAt, startTimers, clearTimers])

  // Try to restore session on mount
  useEffect(() => {
    async function restore() {
      try {
        // 1. Check sessionStorage cache (survives page refresh)
        const cached = getCachedSession()
        if (cached) {
          setState({ status: "authenticated", tenantId: cached.tenantId, jwt: cached })
          return
        }

        // 2. Check Dexie (encrypted, requires PIN to decrypt)
        const sessions = await db.session.toArray()
        if (sessions.length === 0) {
          setState({ status: "login" })
          return
        }
        const session = sessions[0]
        const config = await db.tenantConfig.get(session.tenantId)
        if (!config) {
          setState({ status: "login" })
          return
        }

        if (!isJwtEncrypted(session.encryptedJwt)) {
          setState({ status: "login" })
          return
        }

        // Can't restore without PIN/password — go to login
        setState({ status: "login" })
      } catch {
        setState({ status: "login" })
      }
    }
    restore()
  }, [])

  const login = useCallback(
    async (mode: "pin" | "email", credentials: Record<string, string>) => {
      setState({ status: "loading" })

      try {
        let salt: Uint8Array
        let tenantId: string

        if (mode === "pin") {
          const { employeePin, tenantId: tid, locationId } = credentials as {
            employeePin: string
            tenantId: string
            locationId?: string
          }
          tenantId = tid

          const existing = await db.tenantConfig.get(tenantId)
          if (existing) {
            salt = existing.tenantSalt
            await db.tenantConfig.update(tenantId, { locationId })
          } else {
            salt = generateSalt()
            await db.tenantConfig.put({
              tenantId,
              tenantSalt: salt,
              deviceSecret: generateDeviceSecret(),
              locationId,
            })
          }

          const key = await deriveSessionEncryptionKey(employeePin, salt)
          setEncryptionKey(key)

          const result = await authApi.loginWithPin(employeePin, tenantId, locationId)

          const encrypted = await encryptStore(result, key)
          await db.session.put({ tenantId, encryptedJwt: encrypted })

          setState({ status: "authenticated", tenantId, jwt: result })
          cacheSession(result, tenantId)
        } else {
          const { email, password, locationId } = credentials as {
            email: string
            password: string
            locationId?: string
          }

          const result = await authApi.loginWithEmail(email, password, locationId)

          // Extract real tenantId from JWT payload
          const payload = decodeJwtPayload(result.accessToken)
          tenantId = (payload?.tenantId as string) || email

          const existing = await db.tenantConfig.get(tenantId)
          if (existing) {
            salt = existing.tenantSalt
            await db.tenantConfig.update(tenantId, { locationId })
          } else {
            salt = generateSalt()
            await db.tenantConfig.put({
              tenantId,
              tenantSalt: salt,
              deviceSecret: generateDeviceSecret(),
              locationId,
            })
          }

          const key = await deriveSessionEncryptionKey(password, salt)
          setEncryptionKey(key)

          const encrypted = await encryptStore(result, key)
          await db.session.put({ tenantId, encryptedJwt: encrypted })

          setState({ status: "authenticated", tenantId, jwt: result })
          cacheSession(result, tenantId)
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error occurred"
        setState({ status: "error", error: message })
      }
    },
    []
  )

  const logout = useCallback(async () => {
    // 1. Revocar el token en sync Y saas (S1-5) ANTES de tirar la copia
    //    local: si se revoca después, ya no queda con qué mandarla.
    //    Best-effort con timeout — si no hay red, el logout local igual
    //    ocurre (el token expira solo en <= 30 min).
    const token = state.jwt?.accessToken ?? getCachedSession()?.accessToken
    if (token) {
      const revoked = await authApi.revokeSession(token)
      if (!revoked.sync || !revoked.saas) {
        console.warn("[logout] revocación server-side parcial:", revoked)
      }
    }

    // 2. Limpieza local total (timers, sesión, Dexie, clave).
    clearTimers()
    clearCachedSession()
    await wipeLocalSessionData()
    setEncryptionKey(null)
    setState({ status: "login" })
    window.dispatchEvent(new CustomEvent("auth:expired"))
  }, [clearTimers, state.jwt?.accessToken])

  return (
    <AuthContext.Provider value={{ state, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider")
  return ctx
}
