import { createPublicKey, timingSafeEqual } from 'node:crypto'
import { keyFingerprint, verifyJwt } from '@takeasygo/business/jwt'
import type { JwtPayload } from '@takeasygo/types'
import { isJtiDenied } from '@/lib/jtiDenylist'

/**
 * Verificación del JWT RS256 emitido por apps/sync (Sync Layer / EC2).
 *
 * ¿Por qué existe este módulo?
 *
 * El POS se autentica contra apps/sync con un JWT RS256 de 30 min
 * (claims: sub, tenantId, role, deviceType, locationId). El SaaS, en cambio,
 * siempre usó sesión NextAuth (HS256 con AUTH_SECRET). Sin este puente,
 * toda ruta del SaaS protegida por `requireAuth` devolvía 401 para el POS.
 *
 * Política (S1-4: fail-closed + kid):
 *
 * 1. Si hay env de clave definida pero ninguna parsea como RSA >= 2048,
 *    NO se cae al respaldo embebido: se rechaza todo (PosKeyConfigError).
 *    (Antes una env corrupta degradaba en silencio a la clave embebida.)
 * 2. En producción, sin env definida → también se rechaza: la clave
 *    embebida es solo para dev/test.
 * 3. Cada token trae `kid` (huella sha256-32 de la clave firmante, puesta
 *    por signJwt). Sin kid o con kid distinto → rechazado, aunque la
 *    firma sea válida.
 * 4. (S1-5) Cada token trae `jti` y `verifyPosToken` consulta la denylist
 *    antes de aceptarlo: un logout revoca al instante. Token sin `jti`
 *    (emitido antes de S1-5) → rechazado, igual que sin kid.
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
 * Misconfiguración de la clave de verificación. El llamador debe fallar
 * cerrado (401), nunca degradar al respaldo embebido.
 */
export class PosKeyConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PosKeyConfigError'
  }
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
 *
 * Fail-closed (S1-4):
 *   · Si alguna env está definida pero ninguna es RSA válida → lanza.
 *   · Sin env y NODE_ENV=production → lanza.
 *   · Sin env fuera de producción → respaldo embebido (dev/test).
 *
 * El resultado se cachea solo cuando es válido: una env rota se re-evalúa
 * en cada llamada (y sigue lanzando) hasta que se corrija.
 */
export function getPosJwtPublicKey(): ResolvedPosKey {
  if (cached) return cached

  const candidates: Array<[string, string | undefined]> = [
    ['POS_JWT_PUBLIC_KEY', process.env.POS_JWT_PUBLIC_KEY],
    ['SSO_JWT_PUBLIC_KEY', process.env.SSO_JWT_PUBLIC_KEY],
  ]

  let sawDefined = false
  for (const [name, value] of candidates) {
    if (!value) continue
    sawDefined = true
    if (isRsaPublicKeyPem(value)) {
      cached = { pem: value.trim(), source: 'env' }
      return cached
    }
    console.error(
      `[posJwt] ${name} está definida pero NO es una clave pública RSA válida. ` +
        `Se ignora esta variable y se prueba la siguiente.`
    )
  }

  if (sawDefined) {
    throw new PosKeyConfigError(
      'Hay env de clave JWT definida pero ninguna parsea como RSA >= 2048: fail-closed.'
    )
  }

  if (process.env.NODE_ENV === 'production') {
    throw new PosKeyConfigError(
      'Sin POS_JWT_PUBLIC_KEY/SSO_JWT_PUBLIC_KEY en producción: fail-closed.'
    )
  }

  cached = { pem: POS_PUBLIC_KEY_FALLBACK.trim(), source: 'fallback' }
  return cached
}

/** Lee el `kid` del header de un JWT sin verificar nada aún. */
function readHeaderKid(token: string): string | null {
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  try {
    const header = JSON.parse(
      Buffer.from(token.slice(0, dot), 'base64url').toString('utf-8')
    ) as { kid?: unknown }
    return typeof header.kid === 'string' && header.kid.length > 0 ? header.kid : null
  } catch {
    return null
  }
}

function kidMatches(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(actual, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Verifica un token POS RS256. Devuelve el payload o null si es inválido:
 * env mal configurada (fail-closed), kid ausente/distinto, firma o
 * expiración, token sin `jti` o `jti` revocado (denylist de logout).
 * Nunca usar `decodeJwt` para autorizar.
 */
export async function verifyPosToken(token: string): Promise<JwtPayload | null> {
  if (!token) return null

  let resolved: ResolvedPosKey
  try {
    resolved = getPosJwtPublicKey()
  } catch (error) {
    console.error(`[posJwt] Verificación rechazada (fail-closed): ${(error as Error).message}`)
    return null
  }

  let expectedKid: string
  try {
    expectedKid = keyFingerprint(resolved.pem)
  } catch {
    console.error('[posJwt] La clave resuelta no parsea como RSA: fail-closed.')
    return null
  }

  const tokenKid = readHeaderKid(token)
  if (!tokenKid || !kidMatches(expectedKid, tokenKid)) {
    console.error(
      `[posJwt] kid rechazado (token=${tokenKid ?? 'ausente'} esperado=${expectedKid}).`
    )
    return null
  }

  const payload = verifyJwt(token, resolved.pem)
  if (!payload) return null

  // S1-5: sin jti no hay forma de revocarlo → rechazado (como sin kid).
  if (!payload.jti) {
    console.error('[posJwt] token sin jti: rechazado (S1-5).')
    return null
  }

  if (await isJtiDenied(payload.jti)) {
    console.error(`[posJwt] token revocado (jti deny-listeado): sub=${payload.sub} tenantId=${payload.tenantId}`)
    return null
  }

  return payload
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
