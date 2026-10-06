import type { Request, Response, NextFunction } from "express"
import { config } from "../config"

const tokenBuckets = new Map<string, { count: number; resetAt: number }>()
const tenantBuckets = new Map<string, { count: number; resetAt: number }>()

// Login: solo cuenta FALLAS por IP. Un límite por intento (exitoso o no)
// castigaría a una oficina tras NAT que cambia de turno con 12 terminales a
// la vez; castigar solo los fallos detiene la fuerza bruta sin frenar al
// cajero legítimo. Una clave correcta limpia el contador de esa IP.
const loginFailureBuckets = new Map<string, { count: number; resetAt: number }>()

// Logout (S1-5): 60/min por IP ANTES de verificar — holgado a propósito,
// porque todas las tablets de un local salen por la misma IP y al cierre
// de turno hacen logout casi simultáneo (el límite corta abuso, no al
// equipo). 20/min por sub DESPUÉS de verificar: un logout legítimo más
// los reintentos del POS caben holgados.
const LOGOUT_IP_LIMIT = 60
const LOGOUT_SUB_LIMIT = 20
const logoutIpBuckets = new Map<string, { count: number; resetAt: number }>()
const logoutSubBuckets = new Map<string, { count: number; resetAt: number }>()

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
  const ti = cleanupBuckets(logoutIpBuckets)
  const ts = cleanupBuckets(logoutSubBuckets)
  if (t + tn + tl + ti + ts > 0) {
    console.log(`[rateLimit] Cleaned ${t} token + ${tn} tenant + ${tl} login + ${ti} logoutIp + ${ts} logoutSub expired entries. Sizes: token=${tokenBuckets.size} tenant=${tenantBuckets.size} login=${loginFailureBuckets.size} logoutIp=${logoutIpBuckets.size} logoutSub=${logoutSubBuckets.size}`)
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

/**
 * Logout por IP — se monta ANTES de authMiddleware (ver routes/index.ts):
 * corta el flood antes de verificar firma ni tocar la denylist.
 */
export function logoutIpRateLimiter(req: Request, res: Response, next: NextFunction): void {
  if (!checkBucket(logoutIpBuckets, clientIp(req), LOGOUT_IP_LIMIT, 60_000)) {
    res.status(429).json({ error: "Too many logout requests", code: "rate_limited" })
    return
  }
  next()
}

/** Logout por sub — se llama DENTRO de la ruta, después de verificar. */
export function checkLogoutSubLimit(sub: string): boolean {
  return checkBucket(logoutSubBuckets, sub, LOGOUT_SUB_LIMIT, 60_000)
}

/** Solo para tests: vacía los buckets de logout. */
export function __resetLogoutLimitersForTests(): void {
  logoutIpBuckets.clear()
  logoutSubBuckets.clear()
}
