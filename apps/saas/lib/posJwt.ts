import { createPublicKey } from 'node:crypto'
import { verifyJwt } from '@takeasygo/business/jwt'
import type { JwtPayload } from '@takeasygo/types'

/**
 * Verificación del JWT RS256 emitido por apps/sync (Sync Layer / Render).
 *
 * ¿Por qué existe este módulo?
 *
 * El POS se autentica contra apps/sync con un JWT RS256 de 30 min
 * (claims: sub, tenantId, role, deviceType, locationId). El SaaS, en cambio,
 * siempre usó sesión NextAuth (HS256 con AUTH_SECRET). Sin este puente,
 * toda ruta del SaaS protegida por `requireAuth` devolvía 401 para el POS.
 *
 * ¿Por qué la clave pública está embebida y no solo en env?
 *
 * 1. Una clave pública NO es secreto: no hay riesgo en commitearla.
 * 2. `.env.local` no está trackeado y las env de Vercel se editan a mano.
 *    Se detectó un caso real: un `clear` pegado dentro del PEM rompía
 *    silenciosamente la verificación (y por tanto el SSO).
 * 3. El resolver valida la env con `createPublicKey`; si no es un PEM RSA
 *    parseable, cae al respaldo embebido y emite un error visible en log.
 *    Una env rota degrada con un warning, nunca con un 401 silencioso.
 *
 * Módulo SERVER-ONLY: usa `node:crypto`. Solo lo importan route handlers.
 */

/** Clave pública RS256 de apps/sync (par en apps/sync/keys.*.pem). */
export const POS_PUBLIC_KEY_FALLBACK = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAt9y8UgzRQevTMwV+027I
AOs8TZZDysh7W9bPzAqlv4KLiwMwR7OXRpsxh0cipD000LX1dIkCmNyYs4/K69Kh
yTDTzd0lV5fuIVeLyeGuzXc+CyfRi0ZwS6oP8cGWXju/ec2hFugwQtG2OFgiYvOf
IBNvXv5zb6hbQqkYD1Zo0UgDXjbRb2NAeFWdYGDWsUf3c6pGLTuRhPBUu57cbYcj
dOzP9FUE8G7uhzACLKxn9l32EYfvSzI4Uer3eS6FfB1BT/h7I7sQ2soKxAaghDpz
3cIyxv8lN1ZmMZR/WU/VQUGw0/fKbrZQSVziojv6oLgwehwVsj7+qdy7xc5xl0Is
+QIDAQAB
-----END PUBLIC KEY-----`

export interface ResolvedPosKey {
  pem: string
  source: 'env' | 'fallback'
}

/**
 * Valida que el string sea una clave pública RSA parseable.
 * Más estricto que mirar BEGIN/END: un PEM corrupto en medio del base64
 * (el bug real detectado) pasa el chequeo de BEGIN/END pero no este.
 */
function isRsaPublicKeyPem(value: string | undefined | null): value is string {
  if (!value) return false
  try {
    const key = createPublicKey(value.trim())
    const bits = key.asymmetricKeyDetails?.modulusLength ?? 0
    return key.asymmetricKeyType === 'rsa' && bits >= 2048
  } catch {
    return false
  }
}

let cached: ResolvedPosKey | null = null

/**
 * Resuelve la clave pública a usar. Prioridad:
 *   1. POS_JWT_PUBLIC_KEY (var dedicada)
 *   2. SSO_JWT_PUBLIC_KEY  (var histórica, mismo par de claves)
 *   3. Respaldo embebido
 *
 * El resultado se cachea: las env no cambian en runtime.
 */
export function getPosJwtPublicKey(): ResolvedPosKey {
  if (cached) return cached

  const candidates: Array<[string, string | undefined]> = [
    ['POS_JWT_PUBLIC_KEY', process.env.POS_JWT_PUBLIC_KEY],
    ['SSO_JWT_PUBLIC_KEY', process.env.SSO_JWT_PUBLIC_KEY],
  ]

  for (const [name, value] of candidates) {
    if (value && isRsaPublicKeyPem(value)) {
      cached = { pem: value.trim(), source: 'env' }
      return cached
    }
    if (value) {
      console.error(
        `[posJwt] ${name} está definida pero NO es una clave pública RSA válida. ` +
          `Usando la clave embebida. Revisá la env: el PEM puede estar corrupto.`
      )
    }
  }

  cached = { pem: POS_PUBLIC_KEY_FALLBACK.trim(), source: 'fallback' }
  return cached
}

/**
 * Verifica un token POS RS256. Devuelve el payload o null si es inválido
 * (firma, algoritmo o expiración). Nunca usar `decodeJwt` para autorizar.
 */
export function verifyPosToken(token: string): JwtPayload | null {
  if (!token) return null
  const { pem } = getPosJwtPublicKey()
  return verifyJwt(token, pem)
}

/** Extrae un token Bearer del header Authorization. Devuelve null si no hay. */
export function extractBearerToken(authorization: string | null): string | null {
  if (!authorization) return null
  if (!authorization.startsWith('Bearer ')) return null
  const token = authorization.slice(7).trim()
  return token.length > 0 ? token : null
}

/** Solo para tests: invalida el cache de la clave resuelta. */
export function __resetPosJwtKeyCacheForTests(): void {
  cached = null
}
