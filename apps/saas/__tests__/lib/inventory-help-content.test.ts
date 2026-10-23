// ============================================================================
// inventory-help-content.test.ts — centro de ayuda de Inventario
// ============================================================================
// Protege: que cada tema exista y esté completo, que los «relacionados»
// apunten a temas reales, que la búsqueda ignore acentos y priorice títulos,
// y que las recomendaciones usen los números reales de la sede.
// ============================================================================

import { describe, it, expect } from 'vitest'
import {
  HELP_BY_VIEW,
  HELP_GROUPS,
  HELP_TOPICS,
  helpTopic,
  recommendationsFor,
  searchHelp,
  type HelpState,
} from '@/lib/inventory/ui/help-content'

const base: HelpState = {
  locationName: 'Belgrano',
  status: 'active',
  coverage: { total: 20, ready: 20, noRecipe: 0, variantsPending: 0 },
  totalSkus: 30,
  neverCounted: 0,
  urgentTasks: 0,
  importantTasks: 0,
  orphans: 0,
  pendingSalesPortions: 0,
  canRecipes: true,
  canCapture: true,
  canManage: true,
}

describe('contenido', () => {
  it('cada tema tiene título, resumen, grupo válido y al menos una sección con texto', () => {
    const ids = new Set<string>()
    for (const t of HELP_TOPICS) {
      expect(ids.has(t.id), t.id).toBe(false)
      ids.add(t.id)
      expect(t.title.length, t.id).toBeGreaterThan(5)
      expect(t.summary.length, t.id).toBeGreaterThan(20)
      expect(HELP_GROUPS).toContain(t.group)
      const hasText = t.sections.some((s) => (s.paragraphs?.length ?? 0) + (s.steps?.length ?? 0) + (s.tips?.length ?? 0) + (s.qa?.length ?? 0) > 0)
      expect(hasText, t.id).toBe(true)
    }
  })

  it('los relacionados y los temas por pantalla existen', () => {
    const ids = new Set(HELP_TOPICS.map((t) => t.id))
    for (const t of HELP_TOPICS) for (const r of t.related ?? []) expect(ids.has(r), `${t.id} → ${r}`).toBe(true)
    for (const id of Object.values(HELP_BY_VIEW)) expect(ids.has(id)).toBe(true)
  })

  it('explica que el descuento ocurre al confirmar el pedido (no al cobrar)', () => {
    const text = JSON.stringify(helpTopic('como-funciona')) + JSON.stringify(helpTopic('faq'))
    expect(text).toContain('se confirma')
  })
})

describe('búsqueda', () => {
  it('ignora acentos y mayúsculas', () => {
    expect(searchHelp('MERMA').map((t) => t.id)).toContain('merma')
    expect(searchHelp('estimacion')[0].id).toBe('estimacion')
    expect(searchHelp('estimación')[0].id).toBe('estimacion')
  })
  it('prioriza los temas donde la palabra está en el título o las palabras clave', () => {
    expect(searchHelp('conteo')[0].id).toBe('conteo')
  })
  it('sin coincidencias devuelve vacío', () => {
    expect(searchHelp('zzzzqqq')).toEqual([])
    expect(searchHelp(' ')).toEqual([])
  })
})

describe('recomendaciones para la sede', () => {
  it('todo en orden: lo dice con el nombre de la sede', () => {
    const r = recommendationsFor(base)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: 'all-good', tone: 'ok' })
    expect(r[0].title).toContain('Belgrano')
  })

  it('usa los números reales: urgentes, platos sin receta y conteos', () => {
    const r = recommendationsFor({ ...base, urgentTasks: 2, coverage: { total: 20, ready: 8, noRecipe: 10, variantsPending: 2 }, neverCounted: 7 })
    const ids = r.map((x) => x.id)
    expect(ids).toEqual(expect.arrayContaining(['urgent', 'recipes', 'first-counts']))
    expect(r.find((x) => x.id === 'urgent')!.title).toContain('2 temas urgentes')
    const rec = r.find((x) => x.id === 'recipes')!
    expect(rec.title).toContain('12 platos')
    expect(rec.body).toContain('40 %')
    expect(rec.tone).toBe('urgent') // menos del 60 % del menú
    expect(r.find((x) => x.id === 'first-counts')!.tone).toBe('urgent') // más de 5
  })

  it('sede sin inventario: guía la puesta en marcha según el rol', () => {
    const admin = recommendationsFor({ ...base, status: 'off' })
    expect(admin).toHaveLength(1)
    expect(admin[0].topic).toBe('empezar')
    expect(admin[0].body).toContain('Preparar la sede')
    const cocina = recommendationsFor({ ...base, status: 'off', canManage: false })
    expect(cocina[0].body).toContain('administrador')
  })

  it('en singular cuando es uno', () => {
    const r = recommendationsFor({ ...base, urgentTasks: 1, orphans: 1 })
    expect(r.find((x) => x.id === 'urgent')!.title).toBe('1 tema urgente para hoy')
    expect(r.find((x) => x.id === 'orphans')!.title).toContain('1 receta de un plato que ya no está')
  })
})
