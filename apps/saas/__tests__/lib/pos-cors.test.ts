import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  OFFICIAL_POS_ORIGIN,
  decidePosCors,
  isPosCorsPath,
  normalizeOrigin,
  parseAllowedOrigins,
  posCorsHeaders,
  __resetPosCorsCacheForTests,
  getAllowedPosOrigins,
} from '@/lib/pos-cors'

/**
 * CORS de la superficie POS (lib/pos-cors.ts + proxy.ts).
 *
 * Auditoría POS Online V1 — B1: en producción el SaaS respondía
 * `Access-Control-Allow-Origin: true` porque POS_CORS_ORIGIN estaba cargada
 * como el string "true" y se inyectaba cruda en un header estático. Estos
 * tests fijan que una env mal cargada ya no puede llegar a un header ni
 * dejar al POS oficial sin servicio.
 */

const PROD = { vercelEnv: 'production' }
const DEV = { nodeEnv: 'development' }

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.POS_CORS_ORIGINS
  delete process.env.POS_CORS_ORIGIN
  __resetPosCorsCacheForTests()
})

describe('parseAllowedOrigins', () => {
  it('B1: el string "true" se descarta y el origen oficial sigue permitido', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const origins = parseAllowedOrigins('true', PROD)
    expect(origins).toEqual([OFFICIAL_POS_ORIGIN])
    expect(origins).not.toContain('true')
  })

  it('nunca acepta "*"', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parseAllowedOrigins('*', PROD)).not.toContain('*')
    expect(parseAllowedOrigins('*', DEV)).not.toContain('*')
  })

  it('acepta una lista separada por comas y normaliza la barra final', () => {
    const origins = parseAllowedOrigins('https://pos2.takeasygo.com/, https://staging-pos.takeasygo.com', PROD)
    expect(origins).toContain('https://pos2.takeasygo.com')
    expect(origins).toContain('https://staging-pos.takeasygo.com')
  })

  it('en producción rechaza http, incluso localhost', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const origins = parseAllowedOrigins('http://localhost:5173,http://evil.com', PROD)
    expect(origins).toEqual([OFFICIAL_POS_ORIGIN])
  })

  it('fuera de producción incluye el Vite local por defecto', () => {
    const origins = parseAllowedOrigins(undefined, DEV)
    expect(origins).toContain('http://localhost:5173')
    expect(origins).toContain(OFFICIAL_POS_ORIGIN)
  })
})

describe('normalizeOrigin', () => {
  it('rechaza paths, query, credenciales y basura', () => {
    expect(normalizeOrigin('https://pos.takeasygo.com/app', true)).toBeNull()
    expect(normalizeOrigin('https://pos.takeasygo.com?x=1', true)).toBeNull()
    expect(normalizeOrigin('https://user:pw@pos.takeasygo.com', true)).toBeNull()
    expect(normalizeOrigin('pos.takeasygo.com', true)).toBeNull()
    expect(normalizeOrigin('javascript:alert(1)', true)).toBeNull()
  })

  it('http solo para localhost fuera de producción', () => {
    expect(normalizeOrigin('http://localhost:5173', false)).toBe('http://localhost:5173')
    expect(normalizeOrigin('http://192.168.0.10:5173', false)).toBeNull()
  })
})

describe('getAllowedPosOrigins (process.env)', () => {
  it('lee POS_CORS_ORIGINS y el legacy POS_CORS_ORIGIN', () => {
    process.env.POS_CORS_ORIGINS = 'https://a.takeasygo.com'
    process.env.POS_CORS_ORIGIN = 'https://b.takeasygo.com'
    const origins = getAllowedPosOrigins()
    expect(origins).toContain('https://a.takeasygo.com')
    expect(origins).toContain('https://b.takeasygo.com')
  })
})

describe('isPosCorsPath', () => {
  it('cubre la superficie POS y el logout', () => {
    expect(isPosCorsPath('/api/demo/pos/menu')).toBe(true)
    expect(isPosCorsPath('/api/64b7f0c2a1b2c3d4e5f60718/pos/orders/abc')).toBe(true)
    expect(isPosCorsPath('/api/auth/logout')).toBe(true)
  })

  it('no cubre otras rutas', () => {
    expect(isPosCorsPath('/api/demo/orders')).toBe(false)
    expect(isPosCorsPath('/api/demo/settings/pos/mapping')).toBe(false)
    expect(isPosCorsPath('/api/demo/position')).toBe(false)
    expect(isPosCorsPath('/api/auth/session')).toBe(false)
  })
})

describe('decidePosCors', () => {
  const allowed = [OFFICIAL_POS_ORIGIN]

  it('preflight de un origen permitido → 204 con el origen reflejado', () => {
    const d = decidePosCors('OPTIONS', '/api/demo/pos/menu', OFFICIAL_POS_ORIGIN, null, allowed)
    expect(d.kind).toBe('preflight')
    if (d.kind !== 'preflight') return
    expect(d.headers['Access-Control-Allow-Origin']).toBe(OFFICIAL_POS_ORIGIN)
    expect(d.headers.Vary).toContain('Origin')
  })

  it('logout también tiene CORS (revocación SaaS desde el POS)', () => {
    const d = decidePosCors('OPTIONS', '/api/auth/logout', OFFICIAL_POS_ORIGIN, null, allowed)
    expect(d.kind).toBe('preflight')
  })

  it('origen ajeno → reject (403), tanto en preflight como en el request real', () => {
    expect(decidePosCors('OPTIONS', '/api/demo/pos/menu', 'https://evil.com', null, allowed).kind).toBe('reject')
    expect(decidePosCors('POST', '/api/demo/pos/orders', 'https://evil.com', null, allowed).kind).toBe('reject')
  })

  it('sin Origin (curl/server) → continúa sin headers CORS', () => {
    const d = decidePosCors('GET', '/api/demo/pos/menu', null, null, allowed)
    expect(d).toEqual({ kind: 'continue', headers: null })
  })

  it('same-origin (admin del SaaS) → continúa sin headers CORS', () => {
    const self = 'https://www.takeasygo.com'
    const d = decidePosCors('GET', '/api/demo/pos/tables', self, self, allowed)
    expect(d).toEqual({ kind: 'continue', headers: null })
  })

  it('rutas fuera del alcance no se tocan', () => {
    expect(decidePosCors('GET', '/api/demo/menu', 'https://evil.com', null, allowed).kind).toBe('not-applicable')
  })
})

describe('posCorsHeaders', () => {
  it('métodos + todos los headers que manda el POS + max-age', () => {
    const h = posCorsHeaders(OFFICIAL_POS_ORIGIN)
    for (const m of ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(h['Access-Control-Allow-Methods']).toContain(m)
    }
    for (const name of ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Location-Id']) {
      expect(h['Access-Control-Allow-Headers']).toContain(name)
    }
    expect(h['Access-Control-Max-Age']).toBe('600')
  })
})

describe('next.config.ts', () => {
  it('ya no declara un CORS estático para /api/:tenant/pos (lo hace el proxy)', async () => {
    type Rule = { source: string; headers: { key: string; value: string }[] }
    const mod = (await import('../../next.config')) as { default: { headers?: () => Promise<Rule[]> } }
    const rules = await (mod.default.headers?.() ?? [])
    expect(rules.find((r) => r.source === '/api/:tenant/pos/:path*')).toBeUndefined()
  })
})
