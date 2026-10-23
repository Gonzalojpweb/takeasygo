'use client'

// ============================================================================
// Centro de ayuda de Inventario («Ver ayuda»)
// ============================================================================
// · Abre en el tema de la pantalla donde estás (o en uno puntual desde un «?»).
// · «Para tu sede»: recomendaciones con los números reales (se cargan al abrir).
// · Buscador sin acentos, temas por grupo, pasos, consejos, advertencias y
//   preguntas frecuentes. Relacionados para seguir leyendo.
// El contenido vive en lib/inventory/ui/help-content.ts.
// ============================================================================

import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, BookOpen, CheckCircle2, ChevronRight, Lightbulb, Search, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  HELP_GROUPS,
  HELP_TOPICS,
  helpTopic,
  recommendationsFor,
  searchHelp,
  type HelpState,
  type HelpTopic,
  type HelpTopicId,
  type Recommendation,
} from '@/lib/inventory/ui/help-content'
import { invApi } from './data/api'
import { useResource } from './data/useResource'
import type { OverviewData } from './data/types'
import { Panel, inputClass } from './ui'
import type { V3Context } from './InventoryV3'

export default function HelpCenter({
  ctx,
  open,
  topic: initialTopic,
  onClose,
}: {
  ctx: V3Context
  open: boolean
  topic: HelpTopicId | null
  onClose: () => void
}) {
  const [topicId, setTopicId] = useState<HelpTopicId | null>(initialTopic)
  const [query, setQuery] = useState('')
  const overview = useResource(open ? `${ctx.tenantSlug}|help-overview|${ctx.location.id}|${ctx.version}` : null, (signal) =>
    invApi<OverviewData>(ctx.tenantSlug, `overview?locationId=${ctx.location.id}`, { signal }),
  )

  const recs = useMemo<Recommendation[]>(() => {
    const o = overview.data
    const state: HelpState = {
      locationName: ctx.location.name,
      status: o?.status ?? ctx.location.status,
      coverage: {
        total: o?.coverage.total ?? 0,
        ready: (o?.coverage.controlled ?? 0) + (o?.coverage.needsCounts ?? 0),
        noRecipe: o?.coverage.noRecipe ?? 0,
        variantsPending: o?.coverage.variantsPending ?? 0,
      },
      totalSkus: o?.today?.totals.skus ?? 0,
      neverCounted: o?.today?.totals.neverCounted ?? 0,
      urgentTasks: o?.tasks.filter((t) => t.level === 'urgent').length ?? 0,
      importantTasks: o?.tasks.filter((t) => t.level === 'important').length ?? 0,
      orphans: o?.orphans.length ?? 0,
      pendingSalesPortions: o?.pendingSales.reduce((s, p) => s + p.portions, 0) ?? 0,
      canRecipes: ctx.caps.recipes,
      canCapture: ctx.caps.capture,
      canManage: ctx.caps.manage,
    }
    return overview.data || ctx.location.status === 'off' ? recommendationsFor(state) : []
  }, [overview.data, ctx.location, ctx.caps])

  const results = query.trim() ? searchHelp(query) : null
  const topic = topicId ? helpTopic(topicId) : null

  function openTopic(id: HelpTopicId) {
    setTopicId(id)
    setQuery('')
  }

  return (
    <Panel
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={topic ? topic.title : 'Ayuda de Inventario'}
      description={topic ? topic.summary : 'Cómo funciona, cómo se ajusta y qué conviene hacer, sin tecnicismos.'}
      wide
    >
      <div className="space-y-5">
        <div className="relative">
          <label htmlFor="help-search" className="sr-only">
            Buscar en la ayuda
          </label>
          <Search size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            id="help-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscá: conteo, merma, costo, variante…"
            className={cn(inputClass, 'pl-10')}
          />
        </div>

        {results ? (
          <section aria-label="Resultados" className="space-y-2">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {results.length === 0 ? 'No encontramos nada con esas palabras. Probá con otras (por ejemplo «stock», «receta», «compra»).' : `${results.length} ${results.length === 1 ? 'tema' : 'temas'}`}
            </p>
            <TopicList topics={results} onOpen={openTopic} />
          </section>
        ) : topic ? (
          <TopicView topic={topic} onBack={() => setTopicId(null)} onOpen={openTopic} />
        ) : (
          <Home recs={recs} loading={overview.status === 'loading' && open} onOpen={openTopic} />
        )}
      </div>
    </Panel>
  )
}

function Home({ recs, loading, onOpen }: { recs: Recommendation[]; loading: boolean; onOpen: (id: HelpTopicId) => void }) {
  return (
    <div className="space-y-6">
      <section aria-labelledby="recs-title" className="space-y-2">
        <h3 id="recs-title" className="flex items-center gap-2 text-base font-black">
          <Sparkles size={18} aria-hidden className="text-primary" /> Para tu sede, hoy
        </h3>
        {loading ? (
          <div aria-busy="true" className="h-20 animate-pulse rounded-2xl bg-muted" />
        ) : recs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin recomendaciones por ahora.</p>
        ) : (
          <ul className="space-y-2">
            {recs.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpen(r.topic)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40',
                    r.tone === 'urgent' && 'border-red-600/30 bg-red-50/60 dark:bg-red-950/20',
                    r.tone === 'tip' && 'border-amber-600/30 bg-amber-50/60 dark:bg-amber-950/20',
                    r.tone === 'ok' && 'border-emerald-600/30 bg-emerald-50/60 dark:bg-emerald-950/20',
                  )}
                >
                  {r.tone === 'urgent' ? (
                    <AlertTriangle size={20} aria-hidden className="mt-0.5 shrink-0 text-red-600" />
                  ) : r.tone === 'ok' ? (
                    <CheckCircle2 size={20} aria-hidden className="mt-0.5 shrink-0 text-emerald-600" />
                  ) : (
                    <Lightbulb size={20} aria-hidden className="mt-0.5 shrink-0 text-amber-600" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{r.title}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{r.body}</span>
                    <span className="mt-1 block text-xs font-bold text-primary">Ver cómo hacerlo →</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {HELP_GROUPS.map((g) => (
        <section key={g} aria-labelledby={`g-${g}`} className="space-y-2">
          <h3 id={`g-${g}`} className="text-xs font-black uppercase tracking-wider text-muted-foreground">
            {g}
          </h3>
          <TopicList topics={HELP_TOPICS.filter((t) => t.group === g)} onOpen={onOpen} />
        </section>
      ))}
    </div>
  )
}

function TopicList({ topics, onOpen }: { topics: HelpTopic[]; onOpen: (id: HelpTopicId) => void }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border-2 border-border">
      {topics.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => onOpen(t.id)}
            className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 focus-visible:bg-muted focus-visible:outline-none"
          >
            <BookOpen size={18} aria-hidden className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{t.title}</span>
              <span className="block text-sm text-muted-foreground">{t.summary}</span>
            </span>
            <ChevronRight size={18} aria-hidden className="shrink-0 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  )
}

function TopicView({ topic, onBack, onOpen }: { topic: HelpTopic; onBack: () => void; onOpen: (id: HelpTopicId) => void }) {
  return (
    <article className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-primary">
        <ArrowLeft size={16} aria-hidden /> Todos los temas
      </button>
      {topic.sections.map((s, i) => (
        <section key={i} className="space-y-2">
          {s.heading && <h3 className="text-base font-black">{s.heading}</h3>}
          {s.paragraphs?.map((p) => (
            <p key={p} className="text-sm leading-relaxed text-foreground">
              {p}
            </p>
          ))}
          {s.steps && (
            <ol className="space-y-2">
              {s.steps.map((st, n) => (
                <li key={st} className="flex gap-3 text-sm">
                  <span aria-hidden className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground">
                    {n + 1}
                  </span>
                  <span className="pt-0.5 leading-relaxed">{st}</span>
                </li>
              ))}
            </ol>
          )}
          {s.tips && (
            <ul className="space-y-1.5">
              {s.tips.map((t) => (
                <li key={t} className="flex gap-2 text-sm leading-relaxed">
                  <CheckCircle2 size={16} aria-hidden className="mt-0.5 shrink-0 text-emerald-600" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          )}
          {s.warnings?.map((w) => (
            <p key={w} className="flex gap-2 rounded-xl border-2 border-amber-600/30 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
              <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
              <span>{w}</span>
            </p>
          ))}
          {s.qa && (
            <div className="space-y-2">
              {s.qa.map((qa) => (
                <details key={qa.q} className="group rounded-xl border-2 border-border p-3">
                  <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 font-bold">
                    {qa.q}
                    <ChevronRight size={16} aria-hidden className="shrink-0 transition-transform group-open:rotate-90" />
                  </summary>
                  <p className="mt-2 text-sm text-muted-foreground">{qa.a}</p>
                </details>
              ))}
            </div>
          )}
        </section>
      ))}
      {topic.related && topic.related.length > 0 && (
        <section aria-label="Temas relacionados" className="space-y-2 border-t border-border pt-4">
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Seguí leyendo</p>
          <div className="flex flex-wrap gap-2">
            {topic.related.map((id) => (
              <button key={id} type="button" onClick={() => onOpen(id)} className="min-h-11 rounded-full border-2 border-border px-4 text-sm font-bold hover:bg-muted">
                {helpTopic(id).title}
              </button>
            ))}
          </div>
        </section>
      )}
    </article>
  )
}
