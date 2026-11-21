// ============================================================================
// CORS del reproductor de pantallas (display.takeasygo.com → SaaS)
// ============================================================================
// Mismo diseño que lib/pos-cors.ts: allowlist validada (orígenes exactos,
// https en producción), se refleja el origen solo si está en la lista, nunca
// `*`, y un Origin ajeno a /api/display/* se rechaza con 403 en el proxy.
// Variable: DISPLAY_CORS_ORIGINS (lista separada por comas).
// ============================================================================

import { normalizeOrigin, type PosCorsDecision } from '@/lib/pos-cors'

export const OFFICIAL_DISPLAY_ORIGIN = 'https://display.takeasygo.com'
const DEV_DEFAULT_ORIGINS = ['http://localhost:5175', 'http://127.0.0.1:5175']

export const DISPLAY_CORS_ALLOWED_METHODS = 'GET,POST,OPTIONS'
export const DISPLAY_CORS_ALLOWED_HEADERS = 'Content-Type, Authorization, If-None-Match'
export const DISPLAY_CORS_EXPOSED_HEADERS = 'ETag'
export const DISPLAY_CORS_MAX_AGE = '600'

const DISPLAY_API_RE = /^\/api\/display(?:\/|$)/

export function isDisplayCorsPath(pathname: string): boolean {
  return DISPLAY_API_RE.test(pathname)
}

interface OriginEnv { vercelEnv?: string; nodeEnv?: string }
const isProduction = (env: OriginEnv) => (env.vercelEnv ? env.vercelEnv === 'production' : env.nodeEnv === 'production')

export function parseAllowedDisplayOrigins(raw: string | undefined, env: OriginEnv): string[] {
  const production = isProduction(env)
  const out = new Set<string>(production ? [OFFICIAL_DISPLAY_ORIGIN] : [OFFICIAL_DISPLAY_ORIGIN, ...DEV_DEFAULT_ORIGINS])
  for (const entry of (raw ?? '').split(',')) {
    if (!entry.trim()) continue
    const origin = normalizeOrigin(entry, production)
    if (origin) out.add(origin)
    else console.warn(`[display-cors] origen inválido descartado en DISPLAY_CORS_ORIGINS (len=${entry.trim().length})`)
  }
  return [...out]
}

let cached: { key: string; origins: string[] } | null = null
export function getAllowedDisplayOrigins(): string[] {
  const raw = process.env.DISPLAY_CORS_ORIGINS ?? ''
  const env = { vercelEnv: process.env.VERCEL_ENV, nodeEnv: process.env.NODE_ENV }
  const key = `${raw}|${env.vercelEnv ?? ''}|${env.nodeEnv ?? ''}`
  if (cached?.key !== key) cached = { key, origins: parseAllowedDisplayOrigins(raw, env) }
  return cached.origins
}

export function displayCorsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': DISPLAY_CORS_ALLOWED_METHODS,
    'Access-Control-Allow-Headers': DISPLAY_CORS_ALLOWED_HEADERS,
    'Access-Control-Expose-Headers': DISPLAY_CORS_EXPOSED_HEADERS,
    'Access-Control-Max-Age': DISPLAY_CORS_MAX_AGE,
    Vary: 'Origin',
  }
}

/** Misma forma de decisión que el POS: el proxy la traduce a NextResponse. */
export function decideDisplayCors(
  method: string,
  pathname: string,
  origin: string | null,
  selfOrigin: string | null = null,
  allowed = getAllowedDisplayOrigins(),
): PosCorsDecision {
  if (!isDisplayCorsPath(pathname)) return { kind: 'not-applicable' }
  if (!origin) return method === 'OPTIONS' ? { kind: 'reject' } : { kind: 'continue', headers: null }
  if (selfOrigin && origin === selfOrigin) return { kind: 'continue', headers: null }
  if (!allowed.includes(origin)) return { kind: 'reject' }
  const headers = displayCorsHeaders(origin)
  return method === 'OPTIONS' ? { kind: 'preflight', headers } : { kind: 'continue', headers }
}

/** Solo para tests. */
export function __resetDisplayCorsCacheForTests(): void {
  cached = null
}
