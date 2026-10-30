import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Contrato de exports de los route.ts (Next.js App Router).
 *
 * Next solo acepta que un route.ts exporte handlers HTTP y su configuración.
 * Cualquier otro VALOR exportado rompe el build en Vercel con TS2344
 * («… is incompatible with index signature … not assignable to type
 * 'never'»), y ese chequeo no corre con `tsc` ni con `next typegen`: solo en
 * `next build`. Pasó el 29/10 con `export const RECURRENT_SHORT_CLOSES` en
 * pos/cash/summary. Este test lo detecta antes del deploy.
 *
 * Los tipos e interfaces exportados sí están permitidos (se borran al compilar).
 */

const APP = join(__dirname, '..', 'app')

const ALLOWED = new Set([
  'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'DELETE', 'PATCH',
  'config', 'generateStaticParams', 'revalidate', 'dynamic', 'dynamicParams',
  'fetchCache', 'preferredRegion', 'runtime', 'maxDuration',
])

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...routeFiles(p))
    else if (name === 'route.ts' || name === 'route.tsx') out.push(p)
  }
  return out
}

/** Nombres de VALORES exportados (no tipos) de un archivo. */
export function exportedValueNames(src: string): string[] {
  const names: string[] = []
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function|class|enum)\s+([A-Za-z_$][\w$]*)/gm)) names.push(m[1])
  // export const { GET, POST } = handlers
  for (const m of src.matchAll(/^export\s+const\s+\{([^}]+)\}\s*=/gm)) {
    names.push(...m[1].split(',').map((x) => x.trim().split(':').pop()!.trim()).filter(Boolean))
  }
  // export { a, b as c } (sin `export type { … }`)
  for (const m of src.matchAll(/^export\s+\{([^}]+)\}/gm)) {
    for (const part of m[1].split(',')) {
      const p = part.trim()
      if (!p || p.startsWith('type ')) continue
      names.push(p.split(/\s+as\s+/).pop()!.trim())
    }
  }
  return names
}

describe('exports de route.ts', () => {
  it('detecta el caso que rompió el build (control del propio test)', () => {
    expect(exportedValueNames('export const RECURRENT_SHORT_CLOSES = 3\nexport const GET = x')).toEqual(['RECURRENT_SHORT_CLOSES', 'GET'])
    expect(exportedValueNames('export type A = 1\nexport interface B {}\nexport { type C }')).toEqual([])
  })

  it('ningún route.ts exporta valores que Next no acepta', () => {
    const offenders: string[] = []
    for (const file of routeFiles(APP)) {
      const bad = exportedValueNames(readFileSync(file, 'utf8')).filter((n) => !ALLOWED.has(n))
      if (bad.length) offenders.push(`${relative(APP, file).split(sep).join('/')}: ${bad.join(', ')}`)
    }
    expect(offenders, 'Mové estas constantes/funciones a lib/ e importalas').toEqual([])
  })
})
