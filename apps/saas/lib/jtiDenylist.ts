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
 *
 * Ronda 2 (defectos 1 y 4):
 *  - escrituras fallidas → cola `pendingWrites` que este proceso reintenta
 *    (timer 5s mientras la instancia viva + flush perezoso en la próxima
 *    llamada, como máximo 1/10s); serverless congela los timers entre
 *    invocaciones, el flush perezoso cubre ese caso;
 *  - logs de fallo rate-limitados a 1/min (con Upstash caído, un
 *    console.error por verificación de token inundaría Cloud Logs);
 *  - `verifyDenylistStartupConfig()` al cargar el módulo: en producción
 *    sin Upstash, una línea CRÍTICA por arranque de instancia (franja
 *    horaria, no por request).
 *
 * Ronda 3 (S1-5):
 *  - el flush perezoso corre DESPUÉS de la respuesta (after() de
 *    next/server) y también al revocar (denyJti): no ensucia el latency;
 *  - throttle de logs POR CATEGORÍA (read/write/flush/startup/overflow):
 *    un fallo de lectura no tapa el de escritura ni el de la cola;
 *  - cola con tope MAX_PENDING_DENY_WRITES (expulsa la más vieja);
 *  - denyJti reescribe siempre: es la vía del logout idempotente (200 si
 *    quedó en Upstash, 503 si no).
 */

import { after } from 'next/server'

const DENY_PREFIX = 'jwtDeny:'
const MEMORY_MAX = 10_000
const PENDING_RETRY_INTERVAL_MS = 5_000
const LAZY_FLUSH_MIN_INTERVAL_MS = 10_000
const LOG_THROTTLE_MS = 60_000
/** Tope de la cola de escrituras pendientes (ronda 3, punto 5). */
export const MAX_PENDING_DENY_WRITES = 10_000

/** jti -> epoch ms en que deja de estar vigente el veto. */
const memoryMap = new Map<string, number>()

/** Escrituras en Upstash que fallaron: jti -> epoch ms en que expira el veto. */
const pendingWrites = new Map<string, number>()
let pendingTimer: ReturnType<typeof setTimeout> | null = null
let lastLazyFlushAt = 0

// Throttle POR CATEGORÍA (ronda 3, punto 4): cada tipo de fallo tiene su
// propio cupo de 1/min — un fail-open de lectura en cada auth no debe
// tapar el log de una escritura fallida, ni el de la cola, ni el de arranque.
const lastErrorLogAtByCategory = new Map<string, number>()
function logErrorThrottled(category: string, message: string): void {
  const now = Date.now()
  const last = lastErrorLogAtByCategory.get(category) ?? 0
  if (now - last < LOG_THROTTLE_MS) return
  lastErrorLogAtByCategory.set(category, now)
  console.error(message)
}

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

// ── Verificación de arranque (ronda 2, defecto 4) ───────────────────────────
let startupChecked = false

/**
 * Debe correr al cargar el módulo (arranque de la instancia serverless):
 * en producción SIN Upstash, deja UNA línea CRÍTICA por arranque en lugar
 * de un error por cada verificación de token.
 */
export function verifyDenylistStartupConfig(): void {
  if (startupChecked) return
  startupChecked = true
  if (isProduction() && !upstashConfigured()) console.error(NOT_CONFIGURED_MSG)
}

// ── Cola de escrituras pendientes (ronda 2, defecto 1) ──────────────────────
function schedulePendingFlush(): void {
  if (pendingTimer !== null) return
  pendingTimer = setTimeout(() => {
    pendingTimer = null
    void flushPendingWrites()
  }, PENDING_RETRY_INTERVAL_MS)
  pendingTimer.unref?.()
}

/**
 * Encola una escritura fallida sin dejar que la cola crezca sin límite
 * (ronda 3, punto 5): primero descarta vencidos; si sigue llena, expulsa
 * la más vieja y deja UN log rate-limitado. La cola es mejor esfuerzo —
 * la autoridad sigue siendo Upstash.
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
      'overflow',
      `[jtiDenylist] cola pendingWrites llena (${MAX_PENDING_DENY_WRITES}): se descarta la escritura más vieja.`
    )
  }
  pendingWrites.set(jti, expAt)
}

/** Reintenta las escrituras fallidas con el TTL restante de cada veto. */
export async function flushPendingWrites(): Promise<void> {
  if (pendingWrites.size === 0) return
  if (!upstashConfigured()) {
    // Sin configuración no hay a dónde escribir: solo descartar vencidos.
    const now = Date.now()
    for (const [jti, expAt] of [...pendingWrites]) {
      if (expAt <= now) pendingWrites.delete(jti)
    }
    return
  }
  const now = Date.now()
  try {
    const redis = await getRedis()
    for (const [jti, expAt] of [...pendingWrites]) {
      if (expAt <= now) {
        pendingWrites.delete(jti)
        continue
      }
      await redis.set(DENY_PREFIX + jti, 1, { ex: Math.ceil((expAt - now) / 1000) })
      pendingWrites.delete(jti)
    }
  } catch (err) {
    logErrorThrottled('flush', `[jtiDenylist] reintento de escritura pendiente falló (${pendingWrites.size} en cola): ${err}`)
  }
  if (pendingWrites.size > 0) schedulePendingFlush()
}

/**
 * Ejecuta el flush DESPUÉS de enviar la respuesta (after() de next/server,
 * ronda 3 punto 3): el request no lo espera y el trabajo sigue en el
 * runtime de Vercel. Fuera de un scope de request (tests, scripts)
 * after() lanza → se corre igual, sin esperar.
 */
function runAfterResponse(fn: () => Promise<void>): void {
  try {
    after(() => fn())
  } catch {
    void fn()
  }
}

/**
 * Flush perezoso: en la próxima verificación/revocación, con a lo sumo 1
 * intento cada 10s (no por request — con Upstash caído cada auth no debe
 * pagar un reintento extra). Fire-and-forget: el request no espera.
 */
function maybeFlushPending(): void {
  if (pendingWrites.size === 0) return
  const now = Date.now()
  if (now - lastLazyFlushAt < LAZY_FLUSH_MIN_INTERVAL_MS) return
  lastLazyFlushAt = now
  runAfterResponse(() => flushPendingWrites())
}

/** ¿Este `jti` fue revocado (y su veto sigue vigente)? */
export async function isJtiDenied(jti: string): Promise<boolean> {
  maybeFlushPending()
  const now = Date.now()
  const local = memoryMap.get(jti)
  if (local !== undefined) {
    if (local > now) return true
    memoryMap.delete(jti)
  }

  if (!upstashConfigured()) {
    // Fuera de producción, dev/test sin Upstash: la memoria de esta única
    // instancia es el backend y es coherente con las escrituras.
    if (isProduction()) logErrorThrottled('startup', NOT_CONFIGURED_MSG)
    return false
  }

  try {
    const redis = await getRedis()
    const value = await redis.get(DENY_PREFIX + jti)
    return value !== null && value !== undefined
  } catch (err) {
    logErrorThrottled('read', `[jtiDenylist] Upstash no responde (fail-open): ${err}`)
    return false
  }
}

/**
 * Revoca un `jti` por `ttlSeconds` (la vida restante del token + margen).
 * Devuelve true solo si quedó registrado en Upstash (autoridad
 * multi-instancia).
 *
 * En producción SIN Upstash → log CRÍTICO (rate-limitado 1/min) y false:
 * escribir solo en la memoria de esta instancia sería fingir una
 * revocación que no protege nada. El endpoint responde 503 y el POS
 * registra la revocación como parcial. Con Upstash caído → false y el
 * jti queda en la cola de reintentos (flush 5s + lazy).
 *
 * Ronda 3 (logout idempotente): con el jti YA vetado REESCRIBE en Upstash
 * — no se saltea por veto previo — y devuelve true solo si la escritura
 * quedó: el endpoint responde 200 si sí, 503 si no (nunca 401 por veto).
 * Arranca con un flush perezoso para maximizar la chance de confirmación.
 */
export async function denyJti(jti: string, ttlSeconds: number): Promise<boolean> {
  maybeFlushPending()
  const ttl = Math.max(1, Math.floor(ttlSeconds))

  if (!upstashConfigured()) {
    if (isProduction()) {
      logErrorThrottled('startup', NOT_CONFIGURED_MSG)
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
  pendingWrites.delete(jti)

  try {
    const redis = await getRedis()
    await redis.set(DENY_PREFIX + jti, 1, { ex: ttl })
    return true
  } catch (err) {
    enqueuePendingWrite(jti, now + ttl * 1000)
    schedulePendingFlush()
    logErrorThrottled('write', `[jtiDenylist] Upstash no responde al revocar (en cola de reintentos): ${err}`)
    return false
  }
}

/** Solo para tests: vacía el registro local, la cola, los timers y el throttle de logs. */
export function __resetJtiDenylistForTests(): void {
  memoryMap.clear()
  pendingWrites.clear()
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
  lastErrorLogAtByCategory.clear()
  lastLazyFlushAt = 0
}

/** Solo para tests: jti con escritura en Upstash pendiente. */
export function __getPendingDenyWritesForTests(): string[] {
  return [...pendingWrites.keys()]
}

/** Solo para tests: fuerza el flush de la cola (sin esperar timer/lazy). */
export async function __flushPendingDenyWritesForTests(): Promise<void> {
  await flushPendingWrites()
}

/** Solo para tests: re-arma la verificación de arranque. */
export function __resetStartupCheckForTests(): void {
  startupChecked = false
}

// Al importar el módulo (= arranque de la instancia): producción sin
// Upstash deja constancia una sola vez, no un log por request.
verifyDenylistStartupConfig()
