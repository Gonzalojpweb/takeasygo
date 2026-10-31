import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react"
import type { ReactNode } from "react"
import {
  generateSalt,
  deriveSessionEncryptionKey,
  encryptStore,
} from "@takeasygo/business/browser"
import { db } from "../db/dexie"
import { getEncryptionKey, setEncryptionKey } from "./useEncryptionKey"
import * as authApi from "../services/auth-api"
// Misma constante que usa el cliente /pos/* para leer la sesión: si cada uno
// tuviera la suya, un rename rompería la autenticación en silencio.
import { SESSION_CACHE_KEY } from "../services/pos-api"
import { applyPosLocation, type LocationSwitchDb } from "../services/location-switch"
import { readRootMemory, writeRootMemory } from "../services/root-memory"

// ============================================================================
// Ciclo de vida del token (Auditoría POS Online V1 §1.4)
// ============================================================================
// El token del hub vive 30 min. REFRESH_BEFORE_MS antes de vencer se renueva
// solo (POST /api/v1/auth/refresh). Si el refresh falla por red se reintenta
// cada REFRESH_RETRY_MS; si el server lo rechaza (usuario dado de baja, sede
// cerrada, sesión de más de 16 h) se emite `auth:expiring` y el Header
// muestra el aviso para reingresar antes de que corte.
// El chequeo duro de vencimiento corre cada SESSION_CHECK_MS (antes 60 s:
// el POS podía seguir mandando escrituras con el token vencido).
const REFRESH_BEFORE_MS = 5 * 60 * 1000
const REFRESH_RETRY_MS = 60 * 1000
const SESSION_CHECK_MS = 10 * 1000

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

export interface LoginErrorInfo {
  kind: authApi.LoginErrorKind
  /** Segundos hasta poder reintentar (bloqueo temporal). */
  retryAfter: number | null
}

/**
 * Estados del root (obs. UX 25/10):
 *   loading      phase "boot"  → R0 arranque (restaurando la sesión)
 *                phase "login" → validando credenciales (la pantalla de
 *                                acceso sigue montada: no se pierde lo tipeado)
 *   login/error  → R1/R2/R3 acceso (errorInfo tipado, nunca el texto crudo)
 *   authenticated→ shell
 *   expired      → R6: la sesión venció trabajando. El shell queda montado
 *                  (mismo contexto, misma mesa) bajo un overlay para volver a
 *                  entrar; `busy` mientras se valida el reingreso.
 */
export interface AuthState {
  status: "loading" | "login" | "authenticated" | "error" | "expired"
  phase?: "boot" | "login"
  error?: string
  errorInfo?: LoginErrorInfo
  busy?: boolean
  tenantId?: string
  jwt?: authApi.LoginResponse
}

function errorInfoOf(err: unknown): LoginErrorInfo {
  return err instanceof authApi.LoginError
    ? { kind: err.kind, retryAfter: err.retryAfter }
    : { kind: "unknown", retryAfter: null }
}

/** Recuerda comercio + último usuario en el equipo (solo presentación). */
function rememberLogin(tenantId: string, result: authApi.LoginResponse, mode: "pin" | "email", locationId: string | undefined, email?: string) {
  const prev = readRootMemory()
  const p = result.profile
  writeRootMemory({
    tenantId,
    tenantName: p?.tenantName || (prev?.tenantId === tenantId ? prev.tenantName : ""),
    user: p?.userName ? { name: p.userName, role: p.role, mode, ...(mode === "email" && email ? { email } : {}) } : null,
    locationId: locationId ?? (prev?.tenantId === tenantId ? prev.locationId : null),
    locationName: p?.locationName ?? null,
    at: new Date().toISOString(),
  })
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
    // expiresAt viene en SEGUNDOS (epoch del Sync). Antes se comparaba
    // contra Date.now() en ms → siempre "vencido": cada recarga de página
    // tiraba la sesión y mandaba al login.
    if (Date.now() >= data.expiresAt * 1000) {
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
  const [state, setState] = useState<AuthState>({ status: "loading", phase: "boot" })
  // Estado actual para el login asíncrono (¿reingreso desde «sesión expirada»?).
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Token lifecycle timers ────────────────────────────────────────────
  const clearTimers = useCallback(() => {
    if (refreshTimerRef.current) { clearTimeout(refreshTimerRef.current); refreshTimerRef.current = null }
    if (sessionCheckRef.current) { clearInterval(sessionCheckRef.current); sessionCheckRef.current = null }
  }, [])

  /** Renueva el token. Devuelve true si quedó renovado. */
  const refreshNow = useCallback(async (): Promise<boolean> => {
    const cached = getCachedSession()
    if (!cached) return false
    try {
      const result = await authApi.refreshSession(cached.accessToken)
      cacheSession(result, cached.tenantId)
      // La copia cifrada de Dexie también se rota (si la clave sigue en memoria).
      const key = getEncryptionKey()
      if (key) {
        const encrypted = await encryptStore(result, key)
        await db.session.put({ tenantId: cached.tenantId, encryptedJwt: encrypted })
      }
      authApi.revokeReplacedTokenAtSaas(cached.accessToken)
      setState((prev) =>
        prev.status === "authenticated" ? { ...prev, jwt: result } : prev
      )
      window.dispatchEvent(new CustomEvent("auth:refreshed"))
      return true
    } catch (err) {
      const final = err instanceof authApi.RefreshError && err.isFinal
      console.warn("[auth] refresh falló:", err instanceof Error ? err.message : err)
      window.dispatchEvent(new CustomEvent("auth:expiring", { detail: { final } }))
      return false
    }
  }, [])

  const startTimers = useCallback((expiresAtMs: number) => {
    clearTimers()

    const scheduleRefresh = (delayMs: number) => {
      refreshTimerRef.current = setTimeout(async () => {
        const ok = await refreshNow()
        // Red caída: reintenta mientras el token siga vivo. Un rechazo final
        // también reintenta (barato) por si fue transitorio del lado server.
        if (!ok && Date.now() + REFRESH_RETRY_MS < expiresAtMs) {
          scheduleRefresh(REFRESH_RETRY_MS)
        }
      }, Math.max(0, delayMs))
    }
    scheduleRefresh(expiresAtMs - Date.now() - REFRESH_BEFORE_MS)

    // Chequeo duro: vencido ⇒ fuera. El primero corre en el próximo tick
    // (un token restaurado ya vencido sale sin esperar el intervalo).
    const check = () => {
      if (Date.now() >= expiresAtMs) {
        clearTimers()
        clearCachedSession()
        // R6: overlay sobre el shell, no redirección — el operador ve de
        // dónde viene y vuelve exactamente ahí al reingresar.
        setState((prev) =>
          prev.status === "authenticated"
            ? { status: "expired", tenantId: prev.tenantId, jwt: prev.jwt }
            : { status: "login" }
        )
        window.dispatchEvent(new CustomEvent("auth:expired"))
      }
    }
    sessionCheckRef.current = setInterval(check, SESSION_CHECK_MS)
    setTimeout(check, 0)
  }, [clearTimers, refreshNow])

  // Timers cuando la sesión queda autenticada (y cada vez que el refresh
  // trae un expiresAt nuevo).
  useEffect(() => {
    if (state.status === "authenticated" && state.jwt?.expiresAt) {
      startTimers(state.jwt.expiresAt * 1000)
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
      // Reingreso sin desmontar el shell: sesión vencida (R6) o pantalla
      // bloqueada por inactividad (auditoría 30/10, A6: sesión todavía viva).
      const current = stateRef.current
      const reauth = current.status === "expired" || current.status === "authenticated" ? current : null
      const previousToken = current.status === "authenticated" ? current.jwt?.accessToken : undefined
      setState(reauth ? { ...reauth, busy: true, errorInfo: undefined } : { status: "loading", phase: "login" })

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
            // Cambio de sede: limpia las cachés de la sede anterior (o bloquea
            // si quedan ventas offline sin sincronizar).
            await applyPosLocation(db as unknown as LocationSwitchDb, tenantId, locationId)
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
          rememberLogin(tenantId, result, "pin", locationId)
          // Desbloqueo con un PIN (el mismo u otro cajero): el token anterior
          // no puede quedar vivo.
          if (previousToken && previousToken !== result.accessToken) void authApi.revokeSession(previousToken)
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
            // Cambio de sede: limpia las cachés de la sede anterior (o bloquea
            // si quedan ventas offline sin sincronizar).
            await applyPosLocation(db as unknown as LocationSwitchDb, tenantId, locationId)
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
          rememberLogin(tenantId, result, "email", locationId, email)
          if (previousToken && previousToken !== result.accessToken) void authApi.revokeSession(previousToken)
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error occurred"
        const errorInfo = errorInfoOf(err)
        setState(reauth ? { ...reauth, busy: false, errorInfo } : { status: "error", error: message, errorInfo })
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
      // Si un lado no confirma (503 o red), revokeSession lo loguea y
      // reintenta en memoria (3 envíos, backoff ~10s/~30s) — sin
      // persistir el token en ningún lado.
      await authApi.revokeSession(token)
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
