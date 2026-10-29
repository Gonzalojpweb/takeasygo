#!/usr/bin/env node
// ============================================================================
// Base de conocimiento de TEO — docs/asistente → lib/assistant/kb.generated.json
// ============================================================================
// Harness del asistente (docs/asistente/harnes), «Contrato con la documentación»:
//   1. Cada archivo de modulos/ tiene metadatos YAML válidos: modulo, tipo
//      (siempre_activo | opcional) y roles.
//   2. `modulo` es idéntico a una clave de PLAN_ACCESS (packages/business).
//   3. Nombres fijos de los transversales (06 y 10 siempre; 07 al derivar).
// Un archivo que no cumple NO se empaqueta: el script falla con un error claro
// (es preferible a un asistente que ignora un módulo sin avisar).
//
// La KB se empaqueta como JSON (y no se lee del disco en runtime) porque
// docs/ está fuera de apps/saas: en Vercel no llegaría a la función.
//
// Uso:  node scripts/build-assistant-kb.mjs          (escribe el JSON)
//       node scripts/build-assistant-kb.mjs --check  (falla si está desactualizado)
// ============================================================================

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = join(here, '..', '..', '..')
const DOCS = join(REPO, 'docs', 'asistente')
const PLANS = join(REPO, 'packages', 'business', 'src', 'plans.ts')
const OUT = join(here, '..', 'lib', 'assistant', 'kb.generated.json')

/** Transversales que se empaquetan (08/09 son baterías de prueba, no contexto). */
const CORE_FILES = [
  '00-indice.md',
  '01-roles-y-permisos.md',
  '02-modulos-y-planes.md',
  '03-glosario.md',
  '04-flujos-comunes-por-rol.md',
  '05-errores-globales.md',
  '06-politica-del-asistente.md',
  '07-escalamiento-a-soporte.md',
  '10-system-prompt-base.md',
]
const ROLES = new Set(['admin', 'manager', 'cashier', 'waiter', 'kitchen'])
const TIPOS = new Set(['siempre_activo', 'opcional'])
const BRIEF_HEADING = /^##\s+Descripción breve para negocios que NO lo tienen activo\s*$/im

function planFeatures() {
  const src = readFileSync(PLANS, 'utf8')
  const start = src.indexOf('export const PLAN_ACCESS')
  const end = src.indexOf('export type Feature')
  if (start < 0 || end < 0) throw new Error('No se encontró PLAN_ACCESS en packages/business/src/plans.ts')
  return new Set([...src.slice(start, end).matchAll(/^\s+([a-zA-Z]+):/gm)].map((m) => m[1]))
}

function norm(text) {
  return text.replace(/^﻿/, '').replace(/\r\n/g, '\n').trim()
}

function parseFrontmatter(file, text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text)
  if (!m) throw new Error(`${file}: falta el bloque de metadatos YAML (--- ... ---)`)
  const meta = {}
  for (const line of m[1].split('\n')) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line.trim())
    if (kv) meta[kv[1]] = kv[2].trim()
  }
  const roles = /^\[(.*)\]$/.exec(meta.roles ?? '')
  if (!meta.modulo) throw new Error(`${file}: falta «modulo» en los metadatos`)
  if (!TIPOS.has(meta.tipo)) throw new Error(`${file}: «tipo» debe ser siempre_activo u opcional (tiene «${meta.tipo}»)`)
  if (!roles) throw new Error(`${file}: «roles» debe ser una lista [a, b]`)
  const list = roles[1].split(',').map((r) => r.trim()).filter(Boolean)
  for (const r of list) if (!ROLES.has(r)) throw new Error(`${file}: rol desconocido «${r}»`)
  return { modulo: meta.modulo, tipo: meta.tipo, roles: list, body: text.slice(m[0].length).trim() }
}

export function buildKb() {
  const features = planFeatures()
  const core = {}
  for (const f of CORE_FILES) {
    const p = join(DOCS, f)
    if (!existsSync(p)) throw new Error(`Falta el documento transversal docs/asistente/${f}`)
    core[f] = norm(readFileSync(p, 'utf8'))
  }
  const modules = []
  for (const f of readdirSync(join(DOCS, 'modulos')).filter((n) => n.endsWith('.md')).sort()) {
    const mod = parseFrontmatter(`modulos/${f}`, norm(readFileSync(join(DOCS, 'modulos', f), 'utf8')) + '\n')
    if (!features.has(mod.modulo)) {
      throw new Error(`modulos/${f}: «${mod.modulo}» no es una feature de PLAN_ACCESS (el filtro fallaría en silencio)`)
    }
    const idx = mod.body.search(BRIEF_HEADING)
    const brief = idx >= 0 ? mod.body.slice(idx).replace(BRIEF_HEADING, '').trim().split(/\n##\s/)[0].trim() : ''
    if (mod.tipo === 'opcional' && !brief) {
      throw new Error(`modulos/${f}: un módulo opcional necesita la sección «Descripción breve para negocios que NO lo tienen activo»`)
    }
    const title = (/^#\s+(.+)$/m.exec(mod.body)?.[1] ?? mod.modulo).trim()
    modules.push({ id: `modulos/${f}`, modulo: mod.modulo, tipo: mod.tipo, roles: mod.roles, title, body: mod.body, brief })
  }
  const ids = modules.map((m) => m.modulo)
  const dup = ids.find((id, i) => ids.indexOf(id) !== i)
  if (dup) throw new Error(`Hay dos documentos para el módulo «${dup}»`)
  return { core, modules }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const json = JSON.stringify(buildKb(), null, 1) + '\n'
  if (process.argv.includes('--check')) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : ''
    if (current !== json) {
      console.error('kb.generated.json está desactualizado: corré `node scripts/build-assistant-kb.mjs`')
      process.exit(1)
    }
    console.log('KB del asistente al día')
  } else {
    writeFileSync(OUT, json)
    const kb = JSON.parse(json)
    console.log(`KB del asistente: ${Object.keys(kb.core).length} transversales + ${kb.modules.length} módulos → ${OUT}`)
  }
}
