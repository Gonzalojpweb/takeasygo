import { createSign, createVerify, generateKeyPairSync } from "node:crypto"
import type { JwtPayload } from "@takeasygo/types"

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
 * Genera un par de claves RSA 2048-bit para JWT RS256.
 * Llamar solo una vez en setup inicial, NO en cada request.
 */
export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  })
  return { publicKey, privateKey }
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
  expiresInMs: number = 30 * 60 * 1000
): string {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + Math.floor(expiresInMs / 1000)

  const header = { alg: "RS256", typ: "JWT" }
  const fullPayload: JwtPayload = { ...payload, iat: now, exp }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload))
  const dataToSign = `${encodedHeader}.${encodedPayload}`

  const sign = createSign("RSA-SHA256")
  sign.update(dataToSign)
  const signature = sign.sign(privateKey, "base64url")

  return `${dataToSign}.${signature}`
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

  const [encodedHeader, encodedPayload, signature] = parts
  const dataToVerify = `${encodedHeader}.${encodedPayload}`

  const verify = createVerify("RSA-SHA256")
  verify.update(dataToVerify)

  const isValid = verify.verify(publicKey, signature, "base64url")
  if (!isValid) return null

  try {
    const payload: JwtPayload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf-8")
    )

    if (payload.exp < Math.floor(Date.now() / 1000)) return null

    return payload
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

// ============================================================================
// Helpers
// ============================================================================

function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}
