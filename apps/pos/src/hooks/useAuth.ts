import { useState, useCallback } from "react"
import {
  generateSalt,
  deriveSessionEncryptionKey,
  encryptStore,
  decryptStore,
} from "@takeasygo/business/browser"

function generateDeviceSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}
import { db } from "../db/dexie"
import { getEncryptionKey, setEncryptionKey } from "./useEncryptionKey"
import * as authApi from "../services/auth-api"

export interface AuthState {
  status: "loading" | "login" | "authenticated" | "error"
  error?: string
  tenantId?: string
  jwt?: authApi.LoginResponse
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

function isJwtExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]))
    return payload.exp * 1000 < Date.now()
  } catch {
    return true
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: "login" })

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

          tenantId = credentials.tenantId ?? email

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

          const result = await authApi.loginWithEmail(email, password)

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
    const key = getEncryptionKey()

    if (key) {
      const sessions = await db.session.toArray()
      for (const s of sessions) {
        await db.session.delete(s.tenantId)
      }
    }

    setEncryptionKey(null)
    setState({ status: "login" })
  }, [])

  const init = useCallback(async (employeePin: string, tenantId: string) => {
    try {
      const session = await db.session.get(tenantId)
      const config = await db.tenantConfig.get(tenantId)

      if (!session || !config) {
        setState({ status: "login" })
        return
      }

      if (!isJwtEncrypted(session.encryptedJwt)) {
        setState({ status: "login" })
        return
      }

      const key = await deriveSessionEncryptionKey(employeePin, config.tenantSalt)
      setEncryptionKey(key)

      const jwt = await decryptStore<authApi.LoginResponse>(
        session.encryptedJwt,
        key
      )

      if (isJwtExpired(jwt.accessToken)) {
        setEncryptionKey(null)
        setState({ status: "login" })
        return
      }

      setState({ status: "authenticated", tenantId, jwt })
    } catch {
      setEncryptionKey(null)
      setState({ status: "login" })
    }
  }, [])

  return { state, login, logout, init }
}
