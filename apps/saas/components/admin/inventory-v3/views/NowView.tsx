'use client'

// ============================================================================
// Ahora — el tablero: estado general, números clave y qué resolver hoy
// ============================================================================
// Referencia de diseño: inventoryUI.png.
// · Sede sin inventario o en preparación → puesta en marcha guiada.
// · Sede activa →
//     1. Bloque de estado («Tu inventario está funcionando» / «necesita
//        atención») con las dos acciones principales.
//     2. Cuatro indicadores que llevan a su lista.
//     3. «Atención hoy»: tarjetas con UNA acción cada una (las arma el
//        servidor: lib/inventory/overview.ts).
// ============================================================================

import { useState } from 'react'
import { AlertTriangle, BookOpen, Boxes, CheckCircle2, ChefHat, ChevronRight, ClipboardCheck, Package, PiggyBank, Truck, UtensilsCrossed } from 'lucide-react'
import { cn } from '@/lib/utils'
import { invApi } from '../data/api'
import { useResource } from '../data/useResource'
import type { OverviewData, OverviewTask } from '../data/types'
import { pesos } from '@/lib/inventory/ui/format'
import { ErrorBlock, LoadingBlock, Notice, btnPrimary, btnSecondary } from '../ui'
import { KpiTile, SkuIcon } from '../visual'
import SetupGuide from './SetupGuide'
import type { V3Context } from '../InventoryV3'

const LEVEL: Record<OverviewTask['level'], { label: string; card: string; text: string }> = {
  urgent: { label: 'Urgente', card: 'border-red-600/30 bg-red-50/70 dark:bg-red-950/25', text: 'text-red-700 dark:text-red-300' },
  important: { label: 'Importante', card: 'border-amber-600/30 bg-amber-50/70 dark:bg-amber-950/25', text: 'text-amber-800 dark:text-amber-200' },
  suggestion: { label: 'Sugerencia', card: 'border-border bg-card', text: 'text-muted-foreground' },
}
const FIRST_TASKS = 6

export default function NowView({ ctx }: { ctx: V3Context }) {
  const [showAll, setShowAll] = useState(false)
  const data = useResource(`${ctx.tenantSlug}|overview|${ctx.location.id}|${ctx.version}`, (signal) =>
    invApi<OverviewData>(ctx.tenantSlug, `overview?locationId=${ctx.location.id}`, { signal }),
  )

  if (data.status === 'loading') return <LoadingBlock label="Cargando el estado del inventario" rows={4} />
  if (data.status === 'error' && !data.data) return <ErrorBlock error={data.error} onRetry={data.reload} what="el estado del inventario" />
  const o = data.data!

  if (o.status !== 'active') return <SetupGuide ctx={ctx} overview={o} onChanged={data.reload} />

  function act(t: OverviewTask) {
    const a = t.action
    if (a.type === 'count') ctx.open({ type: 'count', skuId: a.skuId, storageLocationId: a.storageLocationId })
    else if (a.type === 'receive') ctx.open({ type: 'receive', skuId: a.skuId })
    else if (a.type === 'recipe') ctx.open({ type: 'recipe', menuItemId: a.menuItemId, variantName: a.variantName })
  }
  const canAct = (t: OverviewTask) => (t.action.type === 'recipe' ? ctx.caps.recipes : ctx.caps.capture)

  const urgent = o.tasks.filter((t) => t.level === 'urgent').length
  const attention = o.tasks.filter((t) => t.level !== 'suggestion').length
  const ready = o.coverage.controlled + o.coverage.needsCounts
  const pct = o.coverage.total > 0 ? (ready / o.coverage.total) * 100 : 0
  const tasks = showAll ? o.tasks : o.tasks.slice(0, FIRST_TASKS)

  return (
    <div className="space-y-6">
      {data.status === 'error' && <Notice tone="error">No se pudo actualizar: {data.error.message}</Notice>}

      {/* 1. Estado */}
      <section
        aria-labelledby="hero-title"
        className={cn(
          'relative overflow-hidden rounded-3xl border-2 p-6 sm:p-8',
          urgent > 0 ? 'border-red-600/20 bg-gradient-to-br from-red-50 via-orange-50 to-amber-50 dark:from-red-950/30 dark:via-orange-950/20 dark:to-background' : 'border-orange-600/15 bg-gradient-to-br from-orange-50 via-amber-50 to-rose-50 dark:from-orange-950/25 dark:via-amber-950/15 dark:to-background',
        )}
      >
        <div className="relative z-10 max-w-xl space-y-4">
          <div className="flex items-start gap-3">
            <span aria-hidden className={cn('inline-flex size-12 shrink-0 items-center justify-center rounded-2xl text-white', urgent > 0 ? 'bg-red-600' : 'bg-emerald-600')}>
              {urgent > 0 ? <AlertTriangle size={26} aria-hidden /> : <CheckCircle2 size={26} aria-hidden />}
            </span>
            <div>
              <h2 id="hero-title" className="text-2xl font-black tracking-tight sm:text-3xl">
                {urgent > 0 ? 'Tu inventario necesita atención' : 'Tu inventario está funcionando'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground sm:text-base">
                {urgent > 0
                  ? `${urgent} ${urgent === 1 ? 'tema urgente' : 'temas urgentes'} para hoy. Las ventas siguen descontando tus ingredientes.`
                  : 'Las ventas descuentan automáticamente tus ingredientes.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {ctx.caps.capture && (
              <button type="button" className={btnPrimary} onClick={() => ctx.open({ type: 'receive' })}>
                <Truck size={18} aria-hidden /> Registrar mercadería
              </button>
            )}
            {ctx.caps.recipes && (
              <button type="button" className={btnSecondary} onClick={() => ctx.goTo('recetas')}>
                <UtensilsCrossed size={18} aria-hidden /> Configurar recetas
              </button>
            )}
          </div>
        </div>
        {/* Decorativo: categorías de insumos (no transmite información). */}
        <div aria-hidden className="pointer-events-none absolute -right-2 top-1/2 hidden -translate-y-1/2 grid-cols-3 gap-3 opacity-90 xl:grid">
          {['meat_poultry', 'vegetables', 'dairy', 'fish_seafood', 'dry_goods', 'fruits'].map((c, i) => (
            <SkuIcon key={c} category={c} size="xl" className={cn('shadow-sm', i % 2 === 1 && 'translate-y-4')} />
          ))}
        </div>
      </section>

      {/* 2. Indicadores */}
      <section aria-label="Resumen" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          icon={Boxes}
          tone="blue"
          value={String(o.today?.totals.skus ?? 0)}
          label="Insumos"
          hint={o.today && o.today.totals.neverCounted > 0 ? `${o.today.totals.neverCounted} sin conteo inicial` : 'Todos con conteo inicial'}
          onClick={ctx.caps.read ? () => ctx.goTo('productos') : undefined}
        />
        <KpiTile
          icon={ChefHat}
          tone="orange"
          value={`${ready} de ${o.coverage.total}`}
          label="Recetas activas"
          progress={{ value: pct, label: 'Platos que descuentan solos', tone: pct >= 80 ? 'ok' : pct >= 50 ? 'warning' : 'danger' }}
          onClick={ctx.caps.recipes ? () => ctx.goTo('recetas') : undefined}
        />
        <KpiTile
          icon={attention > 0 ? AlertTriangle : CheckCircle2}
          tone={attention > 0 ? 'red' : 'green'}
          value={String(attention)}
          label="Requieren atención"
          hint={attention > 0 ? 'Abajo, en «Atención hoy»' : 'Nada pendiente'}
          onClick={attention > 0 ? () => document.getElementById('attention-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : undefined}
        />
        {ctx.caps.read && o.today?.totals.stockValueCents !== undefined ? (
          <KpiTile icon={PiggyBank} tone="green" value={pesos(o.today.totals.stockValueCents)} label="Valor del stock" hint="Estimado, al costo de compra" onClick={() => ctx.goTo('productos')} />
        ) : (
          <KpiTile icon={Package} tone="neutral" value={String(o.today?.alerts ?? 0)} label="Alertas de stock" hint="Faltantes e inconsistencias" />
        )}
      </section>

      {/* 3. Atención hoy */}
      <section aria-labelledby="attention-title" className="space-y-3 rounded-3xl border-2 border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="attention-title" className="scroll-mt-24 text-xl font-black tracking-tight">
              {o.tasks.length > 0 ? 'Atención hoy' : 'Todo en orden'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {o.tasks.length > 0 ? 'Tareas recomendadas para mantener tu inventario al día, de la más importante a la menos.' : 'No hay nada pendiente. Te avisamos acá cuando algo necesite tu atención.'}
            </p>
          </div>
          {o.tasks.length > FIRST_TASKS && (
            <button type="button" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-primary" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? 'Ver menos' : `Ver todas (${o.tasks.length})`} <ChevronRight size={16} aria-hidden className={cn('transition-transform', showAll && 'rotate-90')} />
            </button>
          )}
        </div>

        {o.tasks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-emerald-600/30 bg-emerald-50/50 px-6 py-8 text-center dark:bg-emerald-950/20">
            <CheckCircle2 size={32} aria-hidden className="text-emerald-600" />
            <p className="font-bold">Las ventas siguen descontando insumos solas.</p>
            <button type="button" className="text-sm font-bold text-primary underline-offset-2 hover:underline" onClick={() => ctx.help('buenas-practicas')}>
              Ver la rutina recomendada
            </button>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {tasks.map((t) => {
              const l = LEVEL[t.level]
              const skuId = t.action.type === 'count' || t.action.type === 'receive' ? t.action.skuId : null
              const sku = skuId ? ctx.allSkus.find((s) => s._id === skuId) : null
              const enabled = canAct(t)
              const body = (
                <>
                  {t.action.type === 'recipe' ? (
                    <span aria-hidden className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                      <ChefHat size={22} aria-hidden />
                    </span>
                  ) : sku ? (
                    <SkuIcon category={sku.category} />
                  ) : (
                    <span aria-hidden className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                      <ClipboardCheck size={22} aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={cn('flex items-center gap-1 text-xs font-black uppercase tracking-wide', l.text)}>
                      {t.level === 'urgent' && <AlertTriangle size={12} aria-hidden />} {l.label}
                    </span>
                    <span className="mt-0.5 block font-bold leading-snug">{t.title}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{t.reason}</span>
                    {enabled && <span className="mt-2 block text-sm font-bold text-primary">{t.actionLabel} →</span>}
                  </span>
                </>
              )
              return (
                <li key={t.id}>
                  {enabled ? (
                    <button
                      type="button"
                      onClick={() => act(t)}
                      className={cn('flex h-full w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40', l.card)}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className={cn('flex h-full items-start gap-3 rounded-2xl border-2 p-4', l.card)}>{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {o.orphans.length > 0 && ctx.caps.recipes && (
        <Notice tone="info">
          <p className="font-bold">
            {o.orphans.length === 1 ? 'Hay una receta' : `Hay ${o.orphans.length} recetas`} de platos o variantes que ya no están en el menú.
          </p>
          <p className="mt-1">No descuentan nada. Revisalas en Recetas: si cambiaste un nombre en el menú, cargá la receta en el plato nuevo.</p>
          <button type="button" className={`${btnSecondary} mt-3`} onClick={() => ctx.goTo('recetas')}>
            <UtensilsCrossed size={18} aria-hidden /> Ver recetas
          </button>
        </Notice>
      )}

      <button
        type="button"
        onClick={() => ctx.help('como-funciona')}
        className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-border p-4 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40"
      >
        <BookOpen size={22} aria-hidden className="shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block font-bold">¿Cómo funciona el control automático?</span>
          <span className="block text-sm text-muted-foreground">Qué mueve el stock, por qué es una estimación y la rutina recomendada, explicado simple.</span>
        </span>
        <ChevronRight size={18} aria-hidden className="shrink-0 text-muted-foreground" />
      </button>
    </div>
  )
}
