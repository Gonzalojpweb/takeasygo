import { createContext, useContext, useState, useCallback, useEffect } from "react"
import type { ReactNode } from "react"
import {
  generateSalt,
  deriveSessionEncryptionKey,
  encryptStore,
} from "@takeasygo/business/browser"
import { db } from "../db/dexie"
import { setEncryptionKey } from "./useEncryptionKey"
import * as authApi from "../services/auth-api"

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

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" })

  // Try to restore session on mount
  useEffect(() => {
    async function restore() {
      try {
        const sessions = await db.session.toArray()
        if (sessions.length === 0) {
          setState({ status: "login" })
          return
        }
        // Use the most recent session
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
          const { employeePin, tenantId: tid } = credentials as {
            employeePin: string
            tenantId: string
          }
          tenantId = tid

          const existing = await db.tenantConfig.get(tenantId)
          if (existing) {
            salt = existing.tenantSalt
          } else {
            salt = generateSalt()
            await db.tenantConfig.put({
              tenantId,
              tenantSalt: salt,
              deviceSecret: generateDeviceSecret(),
            })
          }

          const key = await deriveSessionEncryptionKey(employeePin, salt)
          setEncryptionKey(key)

          const result = await authApi.loginWithPin(employeePin, tenantId)

          const encrypted = await encryptStore(result, key)
          await db.session.put({ tenantId, encryptedJwt: encrypted })

          setState({ status: "authenticated", tenantId, jwt: result })
        } else {
          const { email, password } = credentials as {
            email: string
            password: string
          }

          const result = await authApi.loginWithEmail(email, password)

          // Extract real tenantId from JWT payload
          const payload = decodeJwtPayload(result.accessToken)
          tenantId = (payload?.tenantId as string) || email

          const existing = await db.tenantConfig.get(tenantId)
          if (existing) {
            salt = existing.tenantSalt
          } else {
            salt = generateSalt()
            await db.tenantConfig.put({
              tenantId,
              tenantSalt: salt,
              deviceSecret: generateDeviceSecret(),
            })
          }

          const key = await deriveSessionEncryptionKey(password, salt)
          setEncryptionKey(key)

          const encrypted = await encryptStore(result, key)
          await db.session.put({ tenantId, encryptedJwt: encrypted })

          setState({ status: "authenticated", tenantId, jwt: result })
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
    const sessions = await db.session.toArray()
    for (const s of sessions) {
      await db.session.delete(s.tenantId)
    }
    setEncryptionKey(null)
    setState({ status: "login" })
  }, [])

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
