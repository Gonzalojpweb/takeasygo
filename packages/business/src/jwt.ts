import * as jwt from "jsonwebtoken"
import type { JwtPayload } from "@takeasygo/types"

// ============================================================================
// TTL Constants — Según SECURITYPOS.md sección 4.2
// Usar estas constantes en lugar de números hardcodeados.
// ============================================================================

export const HUB_TOKEN_TTL_MS = 30 * 60 * 1000    // 30 minutos
export const SPOKE_TOKEN_TTL_MS = 2 * 60 * 1000   // 2 minutos

// ============================================================================
// JWT RS256 — Implementación según SECURITYPOS.md sección 4
// Clave pública para verificar, clave privada para firmar.
// Las claves se generan una vez y se almacenan en Vault/Secrets Manager.
// ============================================================================

export interface KeyPair {
  publicKey: string
  privateKey: string
}

  const fullPayload: JwtPayload = { ...payload, iat: now, exp }

  return jwt.sign(fullPayload, privateKey, { algorithm: "RS256" })
}

/**
 * Verifica un JWT con RS256 usando la clave pública.
 * @param token - JWT string
 * @param publicKey - Clave pública PEM
 * @returns Payload decodificado si es válido, null si no
 */
export function verifyJwt(
  token: string,
  publicKey: string
): JwtPayload | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null

  try {
    const decoded = jwt.verify(token, publicKey, { algorithms: ["RS256"] }) as JwtPayload
    return decoded
  } catch {
    return null
  }
}

/**
 * Decodifica un JWT sin verificar la firma.
 * Usar SOLO para inspección — NUNCA para autorización.
 */
export function decodeJwt(token: string): JwtPayload | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null

  try {
    return JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8")
    )
  } catch {
    return null
  }
}

/**
 * Verifica si un JWT está próximo a expirar (menos de N segundos).
 */
export function isJwtExpiringSoon(
  token: string,
  thresholdSeconds: number = 30
): boolean {
  const payload = decodeJwt(token)
  if (!payload) return true
  const now = Math.floor(Date.now() / 1000)
  return payload.exp - now < thresholdSeconds
}


