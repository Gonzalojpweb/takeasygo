import * as jwt from "jsonwebtoken"
import type { JwtPayload } from "@takeasygo/types"
import { createHash, createPublicKey, randomUUID } from "node:crypto"

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

/**
 * Huella de una clave (RSA): sha256 del SPKI DER, primeros 32 hex.
 * Acepta PEM público o privado (se deriva la pública).
 *
 * Es el `kid` que signJwt pone en el header de cada token y con el que
 * apps/saas exige que el token corresponda a la clave que resolvió
 * (S1-4: fail-closed + kid).
 */
export function keyFingerprint(keyPem: string): string {
  return createHash("sha256")
    .update(createPublicKey(keyPem).export({ type: "spki", format: "der" }))
    .digest("hex")
    .slice(0, 32)
}

/**
 * Firma un JWT con RS256 usando la clave privada.
 * @param payload - Claims del JWT (sin iat/exp, se agregan automáticamente)
 * @param privateKey - Clave privada PEM
 * @param expiresInMs - Tiempo de vida en milisegundos (default: 30 min para hub)
 * @returns JWT string firmado
 */
export function signJwt(
  payload: Omit<JwtPayload, "iat" | "exp">,
  privateKey: string,
  expiresInMs: number = HUB_TOKEN_TTL_MS
): string {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + Math.floor(expiresInMs / 1000)

  // jti (S1-5): siempre fresco, pisa cualquier jti que traiga el caller.
  // Es la clave con la que logout lo pone en la denylist (saas y sync).
  const fullPayload: JwtPayload = { ...payload, jti: randomUUID(), iat: now, exp }

  // kid = huella de la clave con la que se firma. Si la clave no parsea,
  // jwt.sign falla igual al firmar, así que un kid ausente solo adelanta
  // el mismo error.
  let kid: string | undefined
  try {
    kid = keyFingerprint(privateKey)
  } catch {
    kid = undefined
  }

  return jwt.sign(fullPayload, privateKey, {
    algorithm: "RS256",
    ...(kid ? { header: { alg: "RS256", kid } } : {}),
  })
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


