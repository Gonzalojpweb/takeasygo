/**
 * Denylist de `jti` (S1-5: logout total).
 *
 * Un logout revoca el token INMEDIATAMENTE, sin esperar a que expire su
 * `exp` (30 min). El endpoint de logout escribe el `jti` acá y
 * `verifyPosToken` lo consulta antes de dar por válida cualquier firma.
 *
 * Doble backend (mismo patrón que lib/rateLimit.ts):
 *  - Upstash Redis (vars UPSTASH_REDIS_REST_*) — autoridad multi-instancia
 *    (serverless). Los tokens mintidos por EC2 se verifican acá, así que la
 *    denylist vive en el único Redis al que Vercel llega.
 *  - in-memory Map — respaldo local en dev/test y caché de lectura rápida.
 *
 * Fail-open: si Upstash falla al LEER, se acepta el token (disponibilidad
 * del POS por encima; el exp sigue siendo el límite duro). Si falla al
 * ESCRIBIR, queda el registro local y se loguea el error.
 */

const DENY_PREFIX = 'jwtDeny:'
const MEMORY_MAX = 10_000

/** jti -> epoch ms en que deja de estar vigente el veto. */
const memoryMap = new Map<string, number>()

function memoryPrune(now: number): void {
  if (memoryMap.size <= MEMORY_MAX) return
  for (const [jti, expAt] of memoryMap) {
    if (expAt <= now) memoryMap.delete(jti)
  }
}

function upstashConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

const NOT_CONFIGURED_MSG =
  '[jtiDenylist] CRÍTICO: UPSTASH_REDIS_REST_URL/TOKEN no configuradas en producción. ' +
  'La denylist solo viviría en la memoria de UNA instancia serverless (no protege nada).'

let redisClient: import('@upstash/redis').Redis | null = null

async function getRedis() {
  if (redisClient) return redisClient
  const { Redis } = await import('@upstash/redis')
  redisClient = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
  return redisClient
}

/** ¿Este `jti` fue revocado (y su veto sigue vigente)? */
export async function isJtiDenied(jti: string): Promise<boolean> {
  const now = Date.now()
  const local = memoryMap.get(jti)
  if (local !== undefined) {
    if (local > now) return true
    memoryMap.delete(jti)
  }

  if (!upstashConfigured()) {
    // Fuera de producción, dev/test sin Upstash: la memoria de esta única
    // instancia es el backend y es coherente con las escrituras.
    if (isProduction()) console.error(NOT_CONFIGURED_MSG)
    return false
  }

  try {
    const redis = await getRedis()
    const value = await redis.get(DENY_PREFIX + jti)
    return value !== null && value !== undefined
  } catch (err) {
    console.error('[jtiDenylist] Upstash no responde (fail-open):', err)
    return false
  }
}

/**
 * Revoca un `jti` por `ttlSeconds` (la vida restante del token + margen).
 * Devuelve true solo si quedó registrado en Upstash (autoridad
 * multi-instancia).
 *
 * En producción SIN Upstash → console.error (fallo ruidoso) y false:
 * escribir solo en la memoria de esta instancia sería fingir una
 * revocación que no protege nada. El endpoint responde 503 y el POS
 * registra la revocación como parcial.
 */
export async function denyJti(jti: string, ttlSeconds: number): Promise<boolean> {
  const ttl = Math.max(1, Math.floor(ttlSeconds))

  if (!upstashConfigured()) {
    if (isProduction()) {
      console.error(NOT_CONFIGURED_MSG)
      return false
    }
    // dev/test: un solo proceso, la memoria es backend válido.
    const now = Date.now()
    memoryMap.set(jti, now + ttl * 1000)
    memoryPrune(now)
    return true
  }

  const now = Date.now()
  memoryMap.set(jti, now + ttl * 1000)
  memoryPrune(now)

  try {
    const redis = await getRedis()
    await redis.set(DENY_PREFIX + jti, 1, { ex: ttl })
    return true
  } catch (err) {
    console.error('[jtiDenylist] Upstash no responde al revocar:', err)
    return false
  }
}

/** Solo para tests: vacía el registro local. */
export function __resetJtiDenylistForTests(): void {
  memoryMap.clear()
}
