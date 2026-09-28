import { describe, it, expect, vi, afterEach } from 'vitest'

/**
 * M4 — CORS de la superficie POS.
 *
 * El POS corre en otro origen (Vite :5173) y manda Authorization +
 * Content-Type + X-Location-Id: TODA llamada dispara preflight. Si este
 * bloque se toca, el POS deja de poder hablar con el SaaS y no hay ningún
 * otro test que lo atrape (los tests de integración van directo al handler).
 *
 * También es una decisión de seguridad: `Access-Control-Allow-Origin` nunca
 * puede ser `*`, porque reflejaría cualquier origen y dejaría que un sitio
 * ajeno consuma la API con un token robado.
 */

type Header = { key: string; value: string }
type Rule = { source: string; headers: Header[] }

const POS_SOURCE = '/api/:tenant/pos/:path*'

async function loadConfig(): Promise<Rule> {
  const mod = (await import('../../next.config')) as { default: { headers?: () => Promise<Rule[]> } }
  const rules = await (mod.default.headers?.() ?? [])
  const rule = rules.find((r) => r.source === POS_SOURCE)
  expect(rule, `no existe la regla CORS ${POS_SOURCE}`).toBeTruthy()
  return rule!
}

function header(rule: Rule, key: string): string {
  const found = rule.headers.find((h) => h.key === key)
  expect(found, `falta el header ${key}`).toBeTruthy()
  return found!.value
}

afterEach(() => {
  vi.resetModules()
  delete process.env.POS_CORS_ORIGIN
})

describe('CORS de /api/[tenant]/pos', () => {
  it('origen explícito, nunca "*"', async () => {
    const rule = await loadConfig()
    const origin = header(rule, 'Access-Control-Allow-Origin')
    expect(origin).not.toBe('*')
    expect(origin).toBe('http://localhost:5173')
    expect(header(rule, 'Vary')).toContain('Origin')
  })

  it('respeta POS_CORS_ORIGIN del entorno', async () => {
    process.env.POS_CORS_ORIGIN = 'https://pos.takeasygo.com'
    const rule = await loadConfig()
    expect(header(rule, 'Access-Control-Allow-Origin')).toBe('https://pos.takeasygo.com')
  })

  it('permite los métodos y todos los headers que el POS manda', async () => {
    const rule = await loadConfig()
    const methods = header(rule, 'Access-Control-Allow-Methods')
    for (const m of ['GET', 'POST', 'PATCH', 'OPTIONS']) {
      expect(methods).toContain(m)
    }

    const headers = header(rule, 'Access-Control-Allow-Headers')
    for (const h of ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Location-Id']) {
      expect(headers).toContain(h)
    }
  })

  it('cachea el preflight para el polling del POS', async () => {
    const rule = await loadConfig()
    expect(header(rule, 'Access-Control-Max-Age')).toBe('600')
  })
})
