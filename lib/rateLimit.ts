/**
 * Rate limiter con doble backend:
 *  - Producción/staging (UPSTASH_REDIS_REST_URL configurado): Upstash Redis (multi-instancia safe)
 *  - Desarrollo local (sin las vars): in-memory Map como fallback
 *
 * Variables requeridas en .env.local (copiadas desde Upstash dashboard → REST API):
 *   UPSTASH_REDIS_REST_URL=https://...
 *   UPSTASH_REDIS_REST_TOKEN=...
 *
 * SECURITY.md R-SCALE-04
 */

// ── In-memory fallback (local dev sin Redis) ────────────────────────────────
const memoryMap = new Map<string, { count: number; resetTime: number }>()

function rateLimitMemory(
  identifier: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number } {
  const now = Date.now()
  const record = memoryMap.get(identifier)

  if (!record || now > record.resetTime) {
    memoryMap.set(identifier, { count: 1, resetTime: now + windowMs })
    return { success: true, remaining: limit - 1 }
  }

  if (record.count >= limit) {
    return { success: false, remaining: 0 }
  }

  record.count++
  return { success: true, remaining: limit - record.count }
}

// ── Upstash Redis backend ───────────────────────────────────────────────────
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

async function rateLimitRedis(
  identifier: string,
  limit: number,
  windowMs: number
): Promise<{ success: boolean; remaining: number }> {
  const redis = await getRedis()
  const key = `rl:${identifier}`
  const windowSec = Math.ceil(windowMs / 1000)

  // INCR es atómico — safe para múltiples instancias serverless
  const count = await redis.incr(key)
  if (count === 1) {
    await redis.expire(key, windowSec)
  }

  if (count > limit) {
    return { success: false, remaining: 0 }
  }

  return { success: true, remaining: limit - count }
}

// ── Función pública ─────────────────────────────────────────────────────────
export async function rateLimit(
  identifier: string,
  limit: number = 20,
  windowMs: number = 60_000
): Promise<{ success: boolean; remaining: number }> {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      return await rateLimitRedis(identifier, limit, windowMs)
    } catch (err) {
      // Si Redis falla, degrada a in-memory para no bloquear al usuario
      console.warn('[rateLimit] Upstash error, fallback to in-memory:', err)
    }
  }

  return rateLimitMemory(identifier, limit, windowMs)
}
