// ============================================================================
// CORS del POS (pos.takeasygo.com → SaaS) — allowlist validada
// ============================================================================
// Por qué existe (Auditoría POS Online V1, B1): el CORS se armaba como header
// ESTÁTICO en next.config.ts con `process.env.POS_CORS_ORIGIN` crudo. En
// Vercel la variable quedó cargada como el string "true" y el SaaS respondía
// `Access-Control-Allow-Origin: true` → el navegador bloqueaba el 100 % de las
// llamadas del POS. Un header estático además no puede reflejar más de un
// origen.
//
// Diseño (security by design):
//   1. La env se PARSEA y VALIDA: cada entrada tiene que ser un origen exacto
//      (`https://host[:port]`, sin path). Lo inválido se descarta con warning;
//      nunca llega a un header.
//   2. En producción solo se aceptan orígenes https. `http://` únicamente para
//      localhost/127.0.0.1 fuera de producción (Vite dev).
//   3. El origen oficial del POS está incluido por defecto en producción: una
//      env mal cargada ya no puede dejar al POS sin servicio.
//   4. Se REFLEJA el origen solo si está en la allowlist; jamás `*` (todas las
//      llamadas llevan `Authorization: Bearer <RS256>`).
//   5. Un request con `Origin` ajeno a una ruta POS se rechaza con 403 en el
//      proxy (defensa en profundidad: no depende de que el navegador respete
//      la respuesta).
//
// Variables: POS_CORS_ORIGINS (lista separada por comas). POS_CORS_ORIGIN
// (singular, legacy) se sigue leyendo para no romper deploys existentes.
// ============================================================================

export const OFFICIAL_POS_ORIGIN = 'https://pos.takeasygo.com'

const DEV_DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']

export const POS_CORS_ALLOWED_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
export const POS_CORS_ALLOWED_HEADERS = 'Content-Type, Authorization, Idempotency-Key, X-Location-Id'
/** El preflight se cachea 10 min: el POS hace polling cada 7 s. */
export const POS_CORS_MAX_AGE = '600'

/** Rutas del SaaS que el POS llama desde otro origen. */
const POS_API_RE = /^\/api\/[^/]+\/pos(?:\/|$)/
const POS_AUTH_PATHS = new Set(['/api/auth/logout'])

export function isPosCorsPath(pathname: string): boolean {
  return POS_API_RE.test(pathname) || POS_AUTH_PATHS.has(pathname)
}

interface OriginEnv {
  /** VERCEL_ENV ('production' | 'preview' | 'development') */
  vercelEnv?: string
  /** NODE_ENV */
  nodeEnv?: string
}

function isProductionEnv(env: OriginEnv): boolean {
  if (env.vercelEnv) return env.vercelEnv === 'production'
  return env.nodeEnv === 'production'
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

/**
 * Normaliza y valida UNA entrada. Devuelve el origen canónico
 * (`protocol//host`) o null si no es un origen exacto aceptable.
 */
export function normalizeOrigin(value: string, production: boolean): string | null {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  // Origen exacto: sin path, query, hash ni credenciales.
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    return null
  }
  if (url.origin !== trimmed) return null

  if (url.protocol === 'https:') return url.origin
  if (url.protocol === 'http:' && !production && LOCAL_HOSTS.has(url.hostname)) {
    return url.origin
  }
  return null
}

/**
 * Allowlist efectiva. Pura (recibe el entorno), así se testea sin tocar
 * process.env.
 */
export function parseAllowedOrigins(raw: string | undefined, env: OriginEnv): string[] {
  const production = isProductionEnv(env)
  const out = new Set<string>(production ? [OFFICIAL_POS_ORIGIN] : [OFFICIAL_POS_ORIGIN, ...DEV_DEFAULT_ORIGINS])

  for (const entry of (raw ?? '').split(',')) {
    if (!entry.trim()) continue
    const origin = normalizeOrigin(entry, production)
    if (origin) {
      out.add(origin)
    } else {
      // No se loguea el valor completo por si alguien pegó un secreto.
      console.warn(`[pos-cors] origen inválido descartado en POS_CORS_ORIGINS (len=${entry.trim().length})`)
    }
  }
  return [...out]
}

let cached: { key: string; origins: string[] } | null = null

/** Allowlist desde process.env, cacheada por valor de las variables. */
export function getAllowedPosOrigins(): string[] {
  const raw = [process.env.POS_CORS_ORIGINS, process.env.POS_CORS_ORIGIN].filter(Boolean).join(',')
  const env = { vercelEnv: process.env.VERCEL_ENV, nodeEnv: process.env.NODE_ENV }
  const key = `${raw}|${env.vercelEnv ?? ''}|${env.nodeEnv ?? ''}`
  if (cached?.key !== key) {
    cached = { key, origins: parseAllowedOrigins(raw, env) }
  }
  return cached.origins
}

export function isAllowedPosOrigin(origin: string | null, allowed = getAllowedPosOrigins()): boolean {
  return Boolean(origin) && allowed.includes(origin as string)
}

/** Headers CORS para un origen YA validado. */
export function posCorsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': POS_CORS_ALLOWED_METHODS,
    'Access-Control-Allow-Headers': POS_CORS_ALLOWED_HEADERS,
    'Access-Control-Max-Age': POS_CORS_MAX_AGE,
    Vary: 'Origin',
  }
}

export type PosCorsDecision =
  | { kind: 'not-applicable' }
  /** Preflight de un origen permitido: responder 204 con headers. */
  | { kind: 'preflight'; headers: Record<string, string> }
  /** Origen ajeno: 403 sin headers CORS. */
  | { kind: 'reject' }
  /** Request real: seguir y adjuntar headers (si hay Origin permitido). */
  | { kind: 'continue'; headers: Record<string, string> | null }

/**
 * Decide qué hacer con un request a una ruta POS. Puro: el proxy solo
 * traduce la decisión a NextResponse.
 */
export function decidePosCors(
  method: string,
  pathname: string,
  origin: string | null,
  /** Origen del propio SaaS (request.nextUrl.origin): same-origin no es CORS. */
  selfOrigin: string | null = null,
  allowed = getAllowedPosOrigins()
): PosCorsDecision {
  if (!isPosCorsPath(pathname)) return { kind: 'not-applicable' }

  // Sin Origin: cliente no-navegador (curl, server-to-server). CORS no
  // aplica; la ruta sigue protegida por el Bearer.
  if (!origin) {
    return method === 'OPTIONS' ? { kind: 'reject' } : { kind: 'continue', headers: null }
  }

  // Same-origin (p. ej. ReservasPanel lee /pos/tables desde el admin).
  if (selfOrigin && origin === selfOrigin) {
    return { kind: 'continue', headers: null }
  }

  if (!isAllowedPosOrigin(origin, allowed)) return { kind: 'reject' }

  const headers = posCorsHeaders(origin)
  return method === 'OPTIONS' ? { kind: 'preflight', headers } : { kind: 'continue', headers }
}

/** Solo para tests. */
export function __resetPosCorsCacheForTests(): void {
  cached = null
}
