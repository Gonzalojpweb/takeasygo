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
// el lockout de login (S1-3). Las ESCRITURAS fallidas van a una cola que
// este proceso reintenta cada 5s (siempre activo), los logs de fallo están
// rate-limitados a 1/min POR CATEGORÍA (read/write/flush) y la cola tiene
// tope (MAX_PENDING_DENY_WRITES, expulsa la más vieja) para no crecer sin
// límite en memoria mientras Redis esté caído.
// ============================================================================

const DENY_PREFIX = "jwtDeny:"
const MEMORY_MAX = 10_000
const PENDING_RETRY_INTERVAL_MS = 5_000
const LOG_THROTTLE_MS = 60_000
/** Tope de la cola de escrituras pendientes (S1-5 r3). */
export const MAX_PENDING_DENY_WRITES = 10_000

/** jti -> epoch ms en que deja de estar vigente el veto. */
const memory = new Map<string, number>()

/**
 * Escrituras en Redis que fallaron (ronda 2, defecto 1): jti -> epoch ms en
 * que expira el veto. Mientras Redis esté caído, un timer de este proceso
 * reintenta con el TTL restante; así una caída transitoria no deja jtis
 * sin persistir entre instancias/reinicios (el 503 + retry del POS cubre
 * el mismo hueco desde el cliente).
 */
const pendingWrites = new Map<string, number>()
let pendingTimer: ReturnType<typeof setTimeout> | null = null

// Log rate-limited POR CATEGORÍA (ronda 3, punto 4): con Redis caído un
// console.error por VERIFICACIÓN inundaría los logs, pero un fallo de
// lectura no debe tapar el de escritura ni el de la cola: cada categoría
// tiene su propio cupo de 1/min.
const lastErrorLogAtByCategory = new Map<string, number>()
function logErrorThrottled(category: string, message: string): void {
  const now = Date.now()
  const last = lastErrorLogAtByCategory.get(category) ?? 0
  if (now - last < LOG_THROTTLE_MS) return
  lastErrorLogAtByCategory.set(category, now)
  console.error(message)
}

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
    logErrorThrottled("read", `[jti-denylist] Redis no responde al revisar jti=${jti}: fail-open.`)
    return false
  }
}

function schedulePendingFlush(): void {
  if (pendingTimer !== null) return
  pendingTimer = setTimeout(() => {
    pendingTimer = null
    void flushPendingWrites()
  }, PENDING_RETRY_INTERVAL_MS)
  pendingTimer.unref?.()
}

/** Reintenta las escrituras fallidas con el TTL restante de cada veto. */
export async function flushPendingWrites(): Promise<void> {
  if (pendingWrites.size === 0) return
  const now = Date.now()
  for (const [jti, expAt] of [...pendingWrites]) {
    if (expAt <= now) {
      // El veto expiró: el propio token ya venció, no hay nada que persistir.
      pendingWrites.delete(jti)
      continue
    }
    try {
      await getRedis().set(DENY_PREFIX + jti, "1", "EX", Math.ceil((expAt - now) / 1000))
      pendingWrites.delete(jti)
    } catch {
      logErrorThrottled(
        "flush",
        `[jti-denylist] reintento de escritura pendiente falló (${pendingWrites.size} en cola): sigue el fail-open local.`
      )
    }
  }
  if (pendingWrites.size > 0) schedulePendingFlush()
}

/**
 * Encola una escritura fallida sin dejar que la cola crezca sin límite
 * (S1-5 r3): primero descarta vencidos; si sigue llena, expulsa la más
 * vieja y deja UN log rate-limitado. La cola es mejor esfuerzo: la
 * autoridad sigue siendo Redis.
 */
function enqueuePendingWrite(jti: string, expAt: number): void {
  if (pendingWrites.has(jti) || pendingWrites.size < MAX_PENDING_DENY_WRITES) {
    pendingWrites.set(jti, expAt)
    return
  }
  const now = Date.now()
  for (const [key, exp] of pendingWrites) {
    if (exp <= now) pendingWrites.delete(key)
  }
  while (pendingWrites.size >= MAX_PENDING_DENY_WRITES) {
    const oldest = pendingWrites.keys().next().value
    if (oldest === undefined) break
    pendingWrites.delete(oldest)
    logErrorThrottled(
      "overflow",
      `[jti-denylist] cola pendingWrites llena (${MAX_PENDING_DENY_WRITES}): se descarta la escritura más vieja.`
    )
  }
  pendingWrites.set(jti, expAt)
}

/**
 * Revoca un `jti` por `ttlSeconds` (la vida restante del token + margen).
 * El registro local se escribe SIEMPRE; Redis es la autoridad entre
 * reinicios/instancias.
 *
 * Devuelve true solo si Redis lo confirmó. Si Redis no responde → false:
 * el endpoint responde 503 para que el POS registre la revocación como
 * PARCIAL y la reintente (la memoria local cubre este proceso igual), y
 * el jti queda en la cola de reintentos de este proceso (flush cada 5s
 * con el TTL restante).
 */
export async function denyJti(jti: string, ttlSeconds: number): Promise<boolean> {
  const ttl = Math.max(1, Math.floor(ttlSeconds))
  const now = Date.now()
  memory.set(jti, now + ttl * 1000)
  memoryPrune(now)
  pendingWrites.delete(jti)

  try {
    await getRedis().set(DENY_PREFIX + jti, "1", "EX", ttl)
    return true
  } catch {
    enqueuePendingWrite(jti, now + ttl * 1000)
    schedulePendingFlush()
    logErrorThrottled("write", `[jti-denylist] Redis no responde al revocar jti=${jti}: queda en memoria local + cola de reintentos (503 al cliente).`)
    return false
  }
}

/** Solo para tests: inyecta un Redis falso (null = cliente real). */
export function __setDenyRedisForTests(client: DenyRedisLike | null): void {
  redisForTests = client
}

/** Solo para tests: vacía el registro local, la cola y los timers. */
export function __resetJtiDenylistForTests(): void {
  memory.clear()
  pendingWrites.clear()
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
  lastErrorLogAtByCategory.clear()
}

/** Solo para tests: jti con escritura en Redis pendiente. */
export function __getPendingDenyWritesForTests(): string[] {
  return [...pendingWrites.keys()]
}
