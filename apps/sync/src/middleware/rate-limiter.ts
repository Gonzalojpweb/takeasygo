import type { Request, Response, NextFunction } from "express"
import Redis from "ioredis"
import { config } from "../config"

const tokenBuckets = new Map<string, { count: number; resetAt: number }>()
const tenantBuckets = new Map<string, { count: number; resetAt: number }>()

// Login: solo cuenta FALLAS por IP. Un límite por intento (exitoso o no)
// castigaría a una oficina tras NAT que cambia de turno con 12 terminales a
// la vez; castigar solo los fallos detiene la fuerza bruta sin frenar al
// cajero legítimo. Una clave correcta limpia el contador de esa IP.
const loginFailureBuckets = new Map<string, { count: number; resetAt: number }>()

const CLEANUP_INTERVAL = 5 * 60 * 1000 // every 5 minutes

function cleanupBuckets(buckets: Map<string, { count: number; resetAt: number }>): number {
  const now = Date.now()
  let cleaned = 0
  for (const [key, bucket] of buckets.entries()) {
    if (now > bucket.resetAt) {
      buckets.delete(key)
      cleaned++
    }
  }
  return cleaned
}

// Periodic cleanup to prevent memory leak from expired entries
setInterval(() => {
  const t = cleanupBuckets(tokenBuckets)
  const tn = cleanupBuckets(tenantBuckets)
  const tl = cleanupBuckets(loginFailureBuckets)
  if (t + tn + tl > 0) {
    console.log(`[rateLimit] Cleaned ${t} token + ${tn} tenant + ${tl} login expired entries. Sizes: token=${tokenBuckets.size} tenant=${tenantBuckets.size} login=${loginFailureBuckets.size}`)
  }
}, CLEANUP_INTERVAL)

function checkBucket(
  buckets: Map<string, { count: number; resetAt: number }>,
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (bucket.count >= limit) return false
  bucket.count++
  return true
}

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const token =
    (req.headers.authorization?.slice(7) ?? "") || (req.ip ?? "unknown")
  const tenantId = req.auth?.tenantId ?? "unknown"

  if (!checkBucket(tokenBuckets, token, config.rateLimitToken, 60_000)) {
    res.status(429).json({ error: "Rate limit exceeded", code: "rate_limited" })
    return
  }

  if (!checkBucket(tenantBuckets, tenantId, config.rateLimitTenant, 60_000)) {
    res.status(429).json({ error: "Tenant rate limit exceeded", code: "rate_limited" })
    return
  }

  next()
}

// req.ip es la IP del cliente real solo con `app.set("trust proxy", 1)` en
// index.ts; sin eso es 127.0.0.1 (la IP de Nginx) y todos caen en el mismo
// contador. Nunca usar req.socket.remoteAddress ni leer X-Forwarded-For a mano.
function clientIp(req: Request): string {
  return req.ip ?? "unknown"
}

/** Se monta antes de validate(): corta el intento antes de tocar la base. */
export function loginRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const bucket = loginFailureBuckets.get(clientIp(req))
  if (bucket && Date.now() <= bucket.resetAt && bucket.count >= config.rateLimitLogin) {
    res.status(429).json({ error: "Too many failed login attempts", code: "rate_limited" })
    return
  }
  next()
}

/** Llamar en cada 401 de credenciales (email y pin). */
export function recordLoginFailure(req: Request): void {
  const key = clientIp(req)
  const now = Date.now()
  const bucket = loginFailureBuckets.get(key)
  if (!bucket || now > bucket.resetAt) {
    loginFailureBuckets.set(key, { count: 1, resetAt: now + 60_000 })
    return
  }
  bucket.count++
}

/** Llamar cuando la clave es correcta: el legítimo no arrastra fallos previos. */
export function clearLoginFailures(req: Request): void {
  loginFailureBuckets.delete(clientIp(req))
}

// ── Lockout por cuenta (Redis) ─────────────────────────────────────────────
// El bucket por IP castiga solo desde la MISMA IP; un atacante con credenciales
// filtradas puede probar desde otra red sin tocar el límite. Este contador va
// por identidad de cuenta (email o usuario PIN) en Redis, así todas las
// instancias y roles de red comparten el castigo.
//
// Progresivo: N fallos dentro de la ventana → lock; cada lock posterior
// duplica la duración (hasta loginLockMaxS). Éxito de login → limpieza total.
// Si Redis no responde, se falla OPEN (no se bloquea el login legítimo por
// infraestructura caída): el límite por IP de arriba sigue activo igual.

const loginLockFailKey = (key: string) => `loginLock:fail:${key}`
const loginLockKey = (key: string) => `loginLock:lock:${key}`
const loginLockCountKey = (key: string) => `loginLock:n:${key}`
const LOGIN_LOCK_PROGRESS_TTL_S = 86_400

let lockRedis: Redis | null = null
let lockRedisForcedOff = false

/** Para tests: inyecta un fake (o null = Redis caído → fail-open). */
export function __setAccountLockRedisForTests(client: Redis | null): void {
  lockRedis = client
  lockRedisForcedOff = client === null
}

function getLockRedis(): Redis | null {
  if (lockRedisForcedOff) return null
  if (!lockRedis) {
    lockRedis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 1_000,
      retryStrategy: (times: number) => Math.min(times * 1_000, 5_000),
    })
    lockRedis.on("error", (err) =>
      console.warn(`[loginLock/redis] ${err.message}`)
    )
  }
  return lockRedis
}

let lastLockWarnAt = 0
function warnLockoutDown(err: unknown): void {
  const now = Date.now()
  if (now - lastLockWarnAt > 60_000) {
    lastLockWarnAt = now
    console.warn(
      `[loginLock] Redis no responde, fail-open (solo aplica el límite por IP): ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

/** Segundos de lockout restantes de la cuenta; 0 = libre. Nunca lanza. */
export async function checkAccountLock(key: string): Promise<number> {
  try {
    const redis = getLockRedis()
    if (!redis) return 0
    const ttl = await redis.ttl(loginLockKey(key))
    return ttl > 0 ? ttl : 0
  } catch (err) {
    warnLockoutDown(err)
    return 0
  }
}

/** Registrar un fallo de credenciales de la cuenta. Nunca lanza. */
export async function recordAccountFailure(key: string): Promise<void> {
  try {
    const redis = getLockRedis()
    if (!redis) return

    const lockTtl = await redis.ttl(loginLockKey(key))
    if (lockTtl > 0) return // ya está lockeada: no acumula sobre el castigo vigente

    const failKey = loginLockFailKey(key)
    const fails = await redis.incr(failKey)
    if (fails === 1) await redis.expire(failKey, config.loginLockWindowS)

    if (fails >= config.loginLockFailLimit) {
      const countKey = loginLockCountKey(key)
      const lockNo = await redis.incr(countKey)
      if (lockNo === 1) await redis.expire(countKey, LOGIN_LOCK_PROGRESS_TTL_S)

      const lockSeconds = Math.min(
        config.loginLockBaseS * 2 ** (lockNo - 1),
        config.loginLockMaxS
      )
      await redis.set(loginLockKey(key), String(lockSeconds), "EX", lockSeconds)
      await redis.del(failKey) // la ventana vuelve a empezar tras el lock
      console.warn(
        `[loginLock] cuenta lockeada ${lockSeconds}s tras ${fails} fallos (lock #${lockNo})`
      )
    }
  } catch (err) {
    warnLockoutDown(err)
  }
}

/** Login exitoso: limpia fallos, lock y progresión de la cuenta. Nunca lanza. */
export async function clearAccountFailures(key: string): Promise<void> {
  try {
    const redis = getLockRedis()
    if (!redis) return
    await redis.del(
      loginLockFailKey(key),
      loginLockKey(key),
      loginLockCountKey(key)
    )
  } catch (err) {
    warnLockoutDown(err)
  }
}
