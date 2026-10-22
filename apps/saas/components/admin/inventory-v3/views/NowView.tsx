'use client'

// ============================================================================
// Ahora — qué necesita atención y cómo resolverlo
// ============================================================================
// Sede sin inventario o en preparación → puesta en marcha guiada.
// Sede activa → resumen, tareas (cada una con UNA acción) y "todo en orden"
// cuando no hay nada pendiente. Las tareas las arma el servidor
// (lib/inventory/overview.ts, con priority.ts).
// ============================================================================

import { CheckCircle2, ChefHat, ClipboardCheck, Truck, UtensilsCrossed } from 'lucide-react'
import { invApi } from '../data/api'
import { useResource } from '../data/useResource'
import type { OverviewData, OverviewTask } from '../data/types'
import { pesos } from '@/lib/inventory/ui/format'
import { EmptyBlock, ErrorBlock, LoadingBlock, Notice, StatusTag, btnPrimary, btnSecondary } from '../ui'
import SetupGuide from './SetupGuide'
import type { V3Context } from '../InventoryV3'

const LEVEL: Record<OverviewTask['level'], { tone: 'danger' | 'warning' | 'info'; label: string }> = {
  urgent: { tone: 'danger', label: 'Urgente' },
  important: { tone: 'warning', label: 'Importante' },
  suggestion: { tone: 'info', label: 'Sugerencia' },
}

export default function NowView({ ctx }: { ctx: V3Context }) {
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

  return (
    <div className="space-y-6">
      {data.status === 'error' && <Notice tone="error">No se pudo actualizar: {data.error.message}</Notice>}

      <section aria-label="Resumen" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Platos que descuentan solos"
          value={`${o.coverage.controlled + o.coverage.needsCounts} de ${o.coverage.total}`}
          hint={o.coverage.noRecipe + o.coverage.variantsPending > 0 ? `${o.coverage.noRecipe + o.coverage.variantsPending} pendientes de receta` : 'Todos configurados'}
        />
        <Stat
          label="Insumos seguidos"
          value={String(o.today?.totals.skus ?? 0)}
          hint={o.today && o.today.totals.neverCounted > 0 ? `${o.today.totals.neverCounted} sin conteo inicial` : 'Todos con conteo inicial'}
        />
        {ctx.caps.read && o.today?.totals.stockValueCents !== undefined ? (
          <Stat label="Stock valorizado (estimado)" value={pesos(o.today.totals.stockValueCents)} hint="Costo promedio de compra" />
        ) : (
          <Stat label="Alertas" value={String(o.today?.alerts ?? 0)} hint="Faltantes e inconsistencias" />
        )}
      </section>

      <section aria-labelledby="tasks-title" className="space-y-3">
        <h2 id="tasks-title" className="text-xl font-black tracking-tight">
          {o.tasks.length > 0 ? 'Para resolver' : 'Todo en orden'}
        </h2>
        {o.tasks.length === 0 ? (
          <EmptyBlock icon={<CheckCircle2 size={32} />} title="No hay nada pendiente ahora">
            Las ventas siguen descontando insumos solas. Te avisamos acá cuando algo necesite tu atención.
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {ctx.caps.capture && (
                <button type="button" className={btnSecondary} onClick={() => ctx.open({ type: 'receive' })}>
                  <Truck size={18} aria-hidden /> Recibir mercadería
                </button>
              )}
            </div>
          </EmptyBlock>
        ) : (
          <ul className="space-y-3">
            {o.tasks.map((t) => (
              <li key={t.id} className="flex flex-col gap-3 rounded-2xl border-2 border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <StatusTag tone={LEVEL[t.level].tone}>{LEVEL[t.level].label}</StatusTag>
                  <p className="font-black">{t.title}</p>
                  <p className="text-sm text-muted-foreground">{t.reason}</p>
                </div>
                {canAct(t) && (
                  <button type="button" className={`${t.level === 'urgent' ? btnPrimary : btnSecondary} shrink-0`} onClick={() => act(t)}>
                    {t.action.type === 'count' ? <ClipboardCheck size={18} aria-hidden /> : t.action.type === 'receive' ? <Truck size={18} aria-hidden /> : <ChefHat size={18} aria-hidden />}
                    {t.actionLabel}
                  </button>
                )}
              </li>
            ))}
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
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border-2 border-border bg-card p-4">
      <p className="text-sm font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
    </div>
  )
}
