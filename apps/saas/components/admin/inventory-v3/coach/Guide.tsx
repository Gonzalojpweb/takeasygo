'use client'

// ============================================================================
// Guía en vivo del inventario — barra superior + panel completo
// ============================================================================
// La barra acompaña en todas las pantallas del inventario: en qué paso estás,
// qué te toca ahora (con el botón que lo hace) y cuántos avisos hay. El panel
// completo («Tu guía») muestra el recorrido de 5 etapas, lo que se vio en tus
// datos con los números, tus platos estrella y las palabras que vas a ver.
// Todo sale de /api/[tenant]/inventory/coach (lib/inventory/coach).
// ============================================================================

import { useState } from 'react'
import { ArrowRight, CircleCheck, Compass, Eye, Maximize2, Minimize2, RefreshCw, Sparkles, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STAGE_CONTENT, STAGE_ORDER } from '@/lib/inventory/coach/content'
import type { CoachResult } from '@/lib/inventory/coach/rules'
import type { HelpTopicId } from '@/lib/inventory/ui/help-content'
import { Panel, btnGhost, btnPrimary, btnSecondary } from '../ui'
import type { V3Context } from '../InventoryV3'
import { FindingCard, LEVEL_LOOK, MiniJourney, ProgressRing, StageBlock } from './parts'
import { runCoachAction, useCoach, type CoachState } from './useCoach'

const TITLES = Object.fromEntries(STAGE_ORDER.map((id) => [id, STAGE_CONTENT[id].title]))

// ── Barra superior ───────────────────────────────────────────────────────────

export function GuideBar({ ctx, coach, onOpen }: { ctx: V3Context; coach: CoachState; onOpen: () => void }) {
  const data = coach.data
  if (!data) return null
  const content = STAGE_CONTENT[data.current]
  const allDone = data.stages.every((s) => s.state === 'done')
  const stops = coach.visible.filter((f) => f.level === 'stop').length

  if (coach.minimized || (allDone && coach.alerts === 0)) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => (coach.minimized ? coach.setMinimized(false) : onOpen())}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-primary/30 bg-primary/5 px-3 text-sm font-bold"
          aria-label={`Tu guía: ${data.pct}% del recorrido${coach.alerts ? `, ${coach.alerts} avisos` : ''}. Mostrar`}
        >
          <ProgressRing pct={data.pct} size={28} label="" />
          <span>{allDone && coach.alerts === 0 ? 'Todo en marcha' : 'Tu guía'}</span>
          {coach.alerts > 0 && (
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-black text-white', stops ? 'bg-red-600' : 'bg-amber-500')}>{coach.alerts}</span>
          )}
          {coach.minimized ? <Maximize2 size={16} aria-hidden /> : <Compass size={16} aria-hidden />}
        </button>
      </div>
    )
  }

  const next = data.next
  return (
    <section
      aria-label="Tu guía de inventario"
      className="relative overflow-hidden rounded-3xl border-2 border-primary/25 bg-gradient-to-br from-primary/[0.07] via-background to-background p-4 sm:p-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <ProgressRing pct={data.pct} size={64} label={`Llevás el ${data.pct}% del recorrido`} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wide text-primary">
              <Sparkles size={14} aria-hidden /> Tu guía · Etapa {content.number} de 5 · {content.title}
            </p>
            <h2 className="mt-1 text-lg font-black leading-snug sm:text-xl">{next.title}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{next.detail}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {next.action && next.actionLabel && (
            <button type="button" className={btnPrimary} onClick={() => runCoachAction(ctx, next.action!)}>
              {next.actionLabel} <ArrowRight size={16} aria-hidden />
            </button>
          )}
          <button type="button" className={btnSecondary} onClick={onOpen}>
            <Compass size={18} aria-hidden /> Ver la guía completa
            {coach.alerts > 0 && (
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-black text-white', stops ? 'bg-red-600' : 'bg-amber-500')} aria-label={`${coach.alerts} avisos`}>
                {coach.alerts}
              </span>
            )}
          </button>
          <button type="button" className={cn(btnGhost, 'min-w-11')} onClick={() => coach.setMinimized(true)} aria-label="Minimizar la guía">
            <Minimize2 size={18} aria-hidden />
          </button>
        </div>
      </div>
      <div className="mt-4">
        <MiniJourney stages={data.stages} titles={TITLES} />
      </div>
    </section>
  )
}

// ── Panel completo ───────────────────────────────────────────────────────────

export function GuidePanel({ ctx, coach, open, onClose }: { ctx: V3Context; coach: CoachState; open: boolean; onClose: () => void }) {
  const data = coach.data
  const go = (fn: () => void) => {
    onClose()
    fn()
  }

  return (
    <Panel open={open} onOpenChange={(v) => !v && onClose()} title="Tu guía de inventario" description={`Te acompaño paso a paso en ${ctx.location.name}, con tus datos reales.`} wide>
      {!data ? (
        <div className="space-y-3" aria-busy="true">
          <p className="text-sm text-muted-foreground">{coach.status === 'error' ? 'No pudimos cargar la guía.' : 'Mirando tus datos…'}</p>
          {coach.status === 'error' && (
            <button type="button" className={btnSecondary} onClick={coach.reload}>
              <RefreshCw size={16} aria-hidden /> Reintentar
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          <Hero ctx={ctx} data={data} onRun={(a) => go(() => runCoachAction(ctx, a))} />

          {/* Lo que vi en tus datos */}
          <section aria-labelledby="guide-findings" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 id="guide-findings" className="text-lg font-black">Lo que vi en tus datos</h3>
                <p className="text-sm text-muted-foreground">Revisé tus recetas, compras, conteos y ventas. Esto es lo que encontré.</p>
              </div>
              {coach.refreshing && <span className="text-xs font-semibold text-muted-foreground">Actualizando…</span>}
            </div>
            <Legend counts={data.counts} />
            {coach.visible.length === 0 ? (
              <div className="flex items-center gap-3 rounded-2xl border-2 border-emerald-600/30 bg-emerald-50/60 p-4 text-sm font-semibold dark:bg-emerald-950/25">
                <CircleCheck size={22} aria-hidden className="shrink-0 text-emerald-600" />
                No encontré nada raro. ¡Vas muy bien!
              </div>
            ) : (
              <div className="space-y-3">
                {coach.visible.map((f, i) => (
                  <FindingCard
                    key={f.id}
                    finding={f}
                    defaultOpen={i === 0 && f.level === 'stop'}
                    onAction={(idx) => go(() => runCoachAction(ctx, f.actions[idx].action))}
                    onDismiss={f.level === 'win' ? undefined : () => coach.dismiss(f)}
                  />
                ))}
              </div>
            )}
            {coach.hiddenCount > 0 && (
              <button type="button" className={btnGhost} onClick={coach.restoreAll}>
                <Eye size={16} aria-hidden /> Mostrar {coach.hiddenCount} {coach.hiddenCount === 1 ? 'aviso que marcaste' : 'avisos que marcaste'} como visto
              </button>
            )}
          </section>

          {/* Recorrido */}
          <section aria-labelledby="guide-journey" className="space-y-3">
            <div>
              <h3 id="guide-journey" className="text-lg font-black">Tu recorrido</h3>
              <p className="text-sm text-muted-foreground">Cinco etapas. Tocá cualquiera para ver cómo se hace, un tip de cocina y los errores más comunes.</p>
            </div>
            <ol className="relative space-y-4 before:absolute before:bottom-6 before:left-[21px] before:top-6 before:w-0.5 before:bg-border">
              {data.stages.map((s) => (
                <StageBlock
                  key={s.id}
                  content={STAGE_CONTENT[s.id]}
                  stage={s}
                  defaultOpen={s.state === 'current'}
                  onHelp={() => go(() => ctx.help(STAGE_CONTENT[s.id].helpTopic as HelpTopicId))}
                >
                  {s.id === 'recipes' && data.starDishes.length > 0 && (
                    <StarDishes data={data} canRecipes={ctx.caps.recipes} onOpen={(menuItemId) => go(() => ctx.open({ type: 'recipe', menuItemId, variantName: null }))} />
                  )}
                </StageBlock>
              ))}
            </ol>
          </section>

          <Glossary />
        </div>
      )}
    </Panel>
  )
}

function Hero({ ctx, data, onRun }: { ctx: V3Context; data: CoachResult; onRun: (a: NonNullable<CoachResult['next']['action']>) => void }) {
  const content = STAGE_CONTENT[data.current]
  return (
    <section className="rounded-3xl bg-gradient-to-br from-primary to-primary/80 p-5 text-primary-foreground shadow-lg shadow-primary/20">
      <div className="flex items-center gap-4">
        <div className="rounded-full bg-white/95 p-1">
          <ProgressRing pct={data.pct} size={72} label={`Llevás el ${data.pct}% del recorrido`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide opacity-90">
            {ctx.location.status === 'active' ? 'Inventario activo' : ctx.location.status === 'preparing' ? 'En preparación' : 'Sin empezar'} · Etapa {content.number} de 5
          </p>
          <p className="mt-1 text-xl font-black leading-snug">{data.next.title}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed opacity-95">{data.next.detail}</p>
      {data.next.action && data.next.actionLabel && (
        <button
          type="button"
          onClick={() => onRun(data.next.action!)}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-primary shadow-sm transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white/60"
        >
          {data.next.actionLabel} <ArrowRight size={16} aria-hidden />
        </button>
      )}
    </section>
  )
}

function Legend({ counts }: { counts: CoachResult['counts'] }) {
  const items = (['stop', 'warn', 'tip', 'win'] as const).filter((l) => counts[l] > 0)
  if (items.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Resumen de avisos">
      {items.map((l) => {
        const look = LEVEL_LOOK[l]
        const Badge = look.badge
        return (
          <li key={l} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold', look.chip)}>
            <Badge size={13} aria-hidden /> {counts[l]} · {look.label}
          </li>
        )
      })}
    </ul>
  )
}

function StarDishes({ data, canRecipes, onOpen }: { data: CoachResult; canRecipes: boolean; onOpen: (menuItemId: string) => void }) {
  return (
    <div className="rounded-xl border-2 border-border p-3">
      <p className="flex items-center gap-1.5 font-black">
        <Star size={16} aria-hidden className="fill-amber-400 text-amber-500" /> Tus platos estrella
      </p>
      <p className="text-xs text-muted-foreground">Los que más vendiste en 30 días. Empezá por acá.</p>
      <ul className="mt-2 divide-y divide-border">
        {data.starDishes.map((d, i) => (
          <li key={d.menuItemId} className="flex items-center justify-between gap-2 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="w-5 text-center text-xs font-black text-muted-foreground">{i + 1}</span>
              <span className="min-w-0">
                <span className="block truncate font-bold">{d.name}</span>
                <span className="block text-xs text-muted-foreground">{d.soldLast30d > 0 ? `${d.soldLast30d} vendidos` : 'Sin ventas registradas'}</span>
              </span>
            </span>
            {d.hasRecipe ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <CircleCheck size={16} aria-hidden /> Con receta
              </span>
            ) : canRecipes ? (
              <button type="button" className={cn(btnSecondary, 'min-h-9 px-3 text-xs')} onClick={() => onOpen(d.menuItemId)}>
                Cargar receta
              </button>
            ) : (
              <span className="text-xs font-bold text-muted-foreground">Sin receta</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

const GLOSSARY: Array<[string, string]> = [
  ['Insumo', 'Cada ingrediente o producto que comprás: merluza, harina, aceite, latas, cajas para delivery.'],
  ['Receta', 'Lo que lleva UN plato tal como sale al salón. Con cada venta se descuenta eso.'],
  ['Conteo', 'Anotar cuánto hay de verdad. Siempre manda sobre lo que calcula el sistema.'],
  ['Registrar mercadería', 'Cargar lo que llega del proveedor. Suma al stock y actualiza el precio.'],
  ['Merma', 'Lo que se pierde: vencido, quemado, caído o comida del personal.'],
  ['En preparación', 'El inventario está abierto pero las ventas todavía no descuentan. Ideal para probar.'],
  ['Sin inventario', 'No alcanza para un plato entero: el plato se pausa solo para no vender lo que no podés servir. Vuelve solo cuando registrás la compra.'],
]

function Glossary() {
  return (
    <section aria-labelledby="guide-glossary" className="space-y-3">
      <h3 id="guide-glossary" className="text-lg font-black">Palabras que vas a ver</h3>
      <dl className="grid gap-2 sm:grid-cols-2">
        {GLOSSARY.map(([term, def]) => (
          <div key={term} className="rounded-xl border-2 border-border p-3">
            <dt className="font-black">{term}</dt>
            <dd className="mt-0.5 text-sm text-muted-foreground">{def}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** Barra + panel de la guía, con su propio estado (se monta solo cuando hay sede). */
export default function GuideHost({ ctx }: { ctx: V3Context }) {
  const coach = useCoach(ctx)
  const [open, setOpen] = useState(false)
  return (
    <>
      <GuideBar ctx={ctx} coach={coach} onOpen={() => setOpen(true)} />
      <GuidePanel ctx={ctx} coach={coach} open={open} onClose={() => setOpen(false)} />
    </>
  )
}
