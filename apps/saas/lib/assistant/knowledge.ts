import kb from './kb.generated.json'
import { ASSISTANT_LIMITS, estimateTokens } from './config'
import type { AssistantContext } from './context'

// ============================================================================
// TEO — selección de documentos (harness §«Cómo se eligen los documentos»)
// ============================================================================
//  1. Siempre: política (06) y prompt base (10) — van en el bloque estable.
//  2. De modulos/: los de módulos ACTIVOS cuyo `roles` incluye el rol.
//  3. Módulos opcionales inactivos: solo su «Descripción breve».
//  4. Transversales de consulta (roles, planes, flujos, errores, glosario,
//     escalamiento) compiten por relevancia con los módulos.
//  5. Presupuesto de 6.000 tokens: se ordena por relevancia (palabras clave)
//     y se recortan los últimos.
// Capa 4 de defensa: lo que el modelo no recibe, no lo puede filtrar.
// ============================================================================

interface KbModule {
  id: string
  modulo: string
  tipo: 'siempre_activo' | 'opcional'
  roles: string[]
  title: string
  body: string
  brief: string
}

interface Kb {
  core: Record<string, string>
  modules: KbModule[]
}

const KB = kb as Kb

export const ALWAYS_DOCS = ['10-system-prompt-base.md', '06-politica-del-asistente.md'] as const
const REFERENCE_DOCS = [
  '01-roles-y-permisos.md',
  '02-modulos-y-planes.md',
  '04-flujos-comunes-por-rol.md',
  '05-errores-globales.md',
  '03-glosario.md',
  '07-escalamiento-a-soporte.md',
] as const

export interface SelectedDoc {
  id: string
  title: string
  text: string
  tokens: number
  score: number
}

export interface Selection {
  docs: SelectedDoc[]
  ids: string[]
  tokens: number
}

const STOPWORDS = new Set(
  'como para pero esta este esto estos estas porque cuando donde quiero puedo tengo hacer tiene sobre desde hasta entre otro otra cual cuales quien hola gracias necesito favor tambien solo cada todo todos todas mismo bien'.split(' ')
)

export function keywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
  return [...new Set(words)]
}

function plain(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function score(question: string[], doc: { title: string; text: string; tag?: string }): number {
  if (question.length === 0) return 0
  const title = plain(`${doc.title} ${doc.tag ?? ''}`)
  const body = plain(doc.text)
  let s = 0
  for (const w of question) {
    const stem = w.length > 6 ? w.slice(0, 6) : w
    if (title.includes(stem)) s += 3
    if (body.includes(stem)) s += 1
  }
  return s
}

/** Política + prompt base: el bloque fijo (cacheable) del prompt de sistema. */
export function alwaysText(): string {
  return ALWAYS_DOCS.map((f) => KB.core[f]).join('\n\n---\n\n')
}

export function candidateDocs(ctx: AssistantContext): Omit<SelectedDoc, 'score'>[] {
  const active = new Set<string>(ctx.activeModules)
  const out: Omit<SelectedDoc, 'score'>[] = []
  for (const f of REFERENCE_DOCS) {
    const text = KB.core[f]
    out.push({ id: f, title: /^#\s+(.+)$/m.exec(text)?.[1] ?? f, text, tokens: estimateTokens(text) })
  }
  for (const m of KB.modules) {
    if (active.has(m.modulo)) {
      if (!m.roles.includes(ctx.role)) continue
      out.push({ id: m.id, title: `${m.title} (${m.modulo}, activo)`, text: m.body, tokens: estimateTokens(m.body) })
    } else if (m.brief) {
      const text = `# ${m.title} — NO ACTIVADO en el plan de este negocio\n\n${m.brief}`
      out.push({ id: `${m.id}#breve`, title: `${m.title} (${m.modulo}, no activado)`, text, tokens: estimateTokens(text) })
    }
  }
  return out
}

export function selectDocs(
  ctx: AssistantContext,
  question: string,
  budgetTokens: number = ASSISTANT_LIMITS.docsBudgetTokens
): Selection {
  const q = keywords(question)
  const ranked = candidateDocs(ctx)
    .map((d, order) => ({ ...d, score: score(q, d), order }))
    .sort((a, b) => b.score - a.score || a.order - b.order)

  const picked: SelectedDoc[] = []
  let used = 0
  for (const d of ranked) {
    if (d.score === 0 && picked.length > 0) break
    if (used + d.tokens > budgetTokens) continue
    picked.push({ id: d.id, title: d.title, text: d.text, tokens: d.tokens, score: d.score })
    used += d.tokens
  }
  // Pregunta sin coincidencias: el mapa general de módulos y planes.
  if (picked.length === 0) {
    const text = KB.core['02-modulos-y-planes.md']
    picked.push({ id: '02-modulos-y-planes.md', title: 'Módulos y planes', text, tokens: estimateTokens(text), score: 0 })
    used += estimateTokens(text)
  }
  return { docs: picked, ids: picked.map((d) => d.id), tokens: used }
}

/** Para tests y para el chequeo de arranque. */
export function kbStats(): { core: number; modules: number; moduleIds: string[] } {
  return { core: Object.keys(KB.core).length, modules: KB.modules.length, moduleIds: KB.modules.map((m) => m.modulo) }
}
