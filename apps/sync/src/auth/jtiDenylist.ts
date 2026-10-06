import Redis from "ioredis"
import { config } from "../config"

// ============================================================================
// Denylist de `jti` (S1-5: logout total)
//
// El POS revoca su token en EL MISMO logout; sync verifica sus tokens
// (HTTP en auth/middleware y handshake de socket.io) contra esta lista
// antes de dar por válida una firma. La autoridad es el Redis local
// (redis://localhost:6379 en EC2 — el mismo que usan colas y sockets);
// el Map en memoria es caché de lectura y respaldo si Redis está caído.
//
// El SaaS tiene SU propio Redis (Upstash, al que EC2 no llega): por eso
// el logout del POS llama a AMBOS endpoints (sync + saas) y cada uno
// escribe en su propia denylist (diseño "dual store").
//
// Fail-open: Redis no responde → se acepta el token (disponibilidad del
// POS por encima; `exp` sigue siendo el límite duro). Mismo criterio que
// el lockout de login (S1-3).
// ============================================================================

const DENY_PREFIX = "jwtDeny:"
const MEMORY_MAX = 10_000

/** jti -> epoch ms en que deja de estar vigente el veto. */
const memory = new Map<string, number>()

/** Superficie mínima de ioredis que usa esta lista (permite fake en tests). */
export interface DenyRedisLike {
  get(key: string): Promise<string | null>
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>
}

let redis: Redis | null = null
let redisForTests: DenyRedisLike | null = null

function getRedis(): DenyRedisLike {
  if (redisForTests) return redisForTests
  if (!redis || redis.status === "end") {
    redis = new Redis(config.redisUrl, {
      // Fallo acotado: si Redis está caído, cada comando se rinde rápido
      // (fail-open sin colgar el request) y el próximo getRedis() recrea
      // el cliente para reconectarse cuando vuelva.
      connectTimeout: 1500,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
    })
    redis.on("error", (err) => console.error("[jti-denylist/redis] error:", err.message))
  }
  return redis
}

function memoryPrune(now: number): void {
  if (memory.size <= MEMORY_MAX) return
  for (const [jti, expAt] of memory) {
    if (expAt <= now) memory.delete(jti)
  }
}

/** ¿Este `jti` fue revocado (y su veto sigue vigente)? */
export async function isJtiDenied(jti: string): Promise<boolean> {
  const now = Date.now()
  const local = memory.get(jti)
  if (local !== undefined) {
    if (local > now) return true
    memory.delete(jti)
  }

  try {
    return (await getRedis().get(DENY_PREFIX + jti)) !== null
  } catch {
    // Redis caído o desconectado: fail-open (ver comentario del header).
    console.error(`[jti-denylist] Redis no responde al revisar jti=${jti}: fail-open.`)
    return false
  }
}

/**
 * Revoca un `jti` por `ttlSeconds` (la vida restante del token + margen).
 * El registro local se escribe SIEMPRE; Redis es la autoridad entre
 * reinicios/instancias (best-effort: si falla, la memoria local cubre
 * mientras viva el proceso).
 */
export async function denyJti(jti: string, ttlSeconds: number): Promise<void> {
  const ttl = Math.max(1, Math.floor(ttlSeconds))
  const now = Date.now()
  memory.set(jti, now + ttl * 1000)
  memoryPrune(now)

  try {
    await getRedis().set(DENY_PREFIX + jti, "1", "EX", ttl)
  } catch {
    console.error(`[jti-denylist] Redis no responde al revocar jti=${jti}: queda en memoria local.`)
  }
}

/** Solo para tests: inyecta un Redis falso (null = cliente real). */
export function __setDenyRedisForTests(client: DenyRedisLike | null): void {
  redisForTests = client
}

/** Solo para tests: vacía el registro local. */
export function __resetJtiDenylistForTests(): void {
  memory.clear()
}
