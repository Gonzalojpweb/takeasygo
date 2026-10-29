import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * OpenAPI de TakeasyGO (/superadmin/api-docs). El spec se genera del código:
 * este test falla si una ruta nueva (o borrada) no se reflejó — corré
 * `node scripts/build-openapi.mjs`.
 */

const SAAS = join(__dirname, '..', '..')
const SPEC_PATH = join(SAAS, 'lib', 'openapi', 'openapi.generated.json')

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...routeFiles(p))
    else if (name === 'route.ts') out.push(p)
  }
  return out
}

const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8')) as {
  openapi: string
  paths: Record<string, Record<string, { operationId: string; parameters?: { name: string; in: string }[]; security: Record<string, string[]>[] }>>
  components: { securitySchemes: Record<string, unknown> }
}

describe('OpenAPI generado', () => {
  it('está al día con el código', async () => {
    // @ts-expect-error módulo .mjs sin tipos
    const { buildSpec } = await import('../../scripts/build-openapi.mjs')
    const fresh = JSON.stringify(buildSpec(), null, 1) + '\n'
    expect(readFileSync(SPEC_PATH, 'utf8').replace(/\r\n/g, '\n'), 'corré: node scripts/build-openapi.mjs').toBe(fresh)
  })

  it('documenta TODAS las rutas del POS online y del asistente', () => {
    for (const group of ['pos', 'assistant']) {
      for (const file of routeFiles(join(SAAS, 'app', 'api', '[tenant]', group))) {
        const rel = relative(join(SAAS, 'app'), join(file, '..')).split(sep).join('/')
        const path = '/' + rel.replace(/\[([^\]]+)\]/g, '{$1}')
        expect(spec.paths[path], `${path} no está en el spec`).toBeDefined()
      }
    }
  })

  it('es OpenAPI 3.1 coherente: parámetros de ruta, operationIds únicos y esquemas de seguridad existentes', () => {
    expect(spec.openapi).toBe('3.1.0')
    const ids = new Set<string>()
    for (const [path, ops] of Object.entries(spec.paths)) {
      const params = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]).sort()
      for (const [method, op] of Object.entries(ops)) {
        expect(['get', 'post', 'put', 'patch', 'delete']).toContain(method)
        expect(ids.has(op.operationId), `operationId repetido: ${op.operationId}`).toBe(false)
        ids.add(op.operationId)
        const declared = (op.parameters ?? []).filter((p) => p.in === 'path').map((p) => p.name).sort()
        expect(declared, `${method.toUpperCase()} ${path}`).toEqual(params)
        for (const req of op.security) for (const scheme of Object.keys(req)) expect(spec.components.securitySchemes).toHaveProperty(scheme)
      }
    }
  })

  it('las rutas internas del Sync exigen el secreto interno y las del POS el JWT', () => {
    expect(spec.paths['/api/v1/internal/orders'].post.security).toEqual([{ InternalSecret: [] }])
    expect(spec.paths['/api/{tenant}/pos/orders'].post.security).toEqual([{ PosBearer: [] }])
    expect(spec.paths['/api/v1/health'].get.security).toEqual([])
  })
})
