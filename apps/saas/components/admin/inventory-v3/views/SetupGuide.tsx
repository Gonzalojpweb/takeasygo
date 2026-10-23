'use client'

// ============================================================================
// Puesta en marcha guiada de una sede
// ============================================================================
//   1. Preparar la sede (las ventas todavía NO descuentan)
//   2. Recetas de los platos que más se venden (no hace falta todos)
//   3. Conteo inicial de los insumos de esas recetas
//   4. Activar: desde ahí, cada venta de un plato con receta descuenta
// La cobertura real se ve siempre: qué platos van a descontar y cuáles no.
// Preparar y activar son decisiones de gestión (capacidad `manage`).
// ============================================================================

import { useState } from 'react'
import { CheckCircle2, ChefHat, ClipboardCheck, Power } from 'lucide-react'
import { invApi } from '../data/api'
import type { OverviewData } from '../data/types'
import { Notice, Spinner, StatusTag, btnPrimary, btnSecondary } from '../ui'
import type { V3Context } from '../InventoryV3'

const COVERAGE_TEXT: Record<string, string> = {
  controlled: 'Listo',
  needs_counts: 'Falta conteo inicial',
  variants_pending: 'Faltan variantes',
  no_recipe: 'Sin receta',
}

export default function SetupGuide({ ctx, overview, onChanged }: { ctx: V3Context; overview: OverviewData; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmActivate, setConfirmActivate] = useState(false)
  const status = overview.status
  const cov = overview.coverage
  const ready = cov.controlled + cov.needsCounts
  const missingCounts = uniqueBy(overview.dishesToSetup.flatMap((d) => d.missingCounts), (m) => m.skuId)
  const recipesDone = cov.withRecipe > 0
  const countsDone = recipesDone && missingCounts.length === 0

  async function changeState(mode: 'prepare' | 'activate') {
    setBusy(true)
    setError(null)
    const res = await invApi(ctx.tenantSlug, 'setup', { method: 'POST', body: { locationId: ctx.location.id, skus: [], mode } })
    setBusy(false)
    if (!res.ok) {
      setError(res.error.message)
      return
    }
    setConfirmActivate(false)
    await ctx.refreshStatus()
    ctx.refreshCatalog()
    onChanged()
  }

  const step = status === 'off' ? 1 : !recipesDone ? 2 : !countsDone ? 3 : 4

  return (
    <section aria-labelledby="setup-title" className="space-y-6">
      <div>
        <h2 id="setup-title" className="text-xl font-black tracking-tight">
          Puesta en marcha de {ctx.location.name}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          En cuatro pasos el sistema empieza a descontar insumos solo con cada venta. No hace falta cargar todo el menú:
          empezá por lo que más vendés.
        </p>
        <button type="button" className="mt-2 min-h-11 text-sm font-bold text-primary underline-offset-2 hover:underline" onClick={() => ctx.help('empezar')}>
          Ver la guía de puesta en marcha
        </button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}

      <ol className="space-y-4">
        <Step n={1} current={step === 1} done={status !== 'off'} title="Preparar la sede">
          {status === 'off' ? (
            <>
              <p>Crea el depósito de la cocina. Mientras la sede está en preparación, las ventas no descuentan nada: podés armar recetas y contar sin apuro.</p>
              {ctx.caps.manage ? (
                <button type="button" className={btnPrimary} onClick={() => changeState('prepare')} disabled={busy}>
                  {busy ? <Spinner label="Preparando la sede" /> : <ChefHat size={18} aria-hidden />} Empezar la preparación
                </button>
              ) : (
                <Notice tone="info">La preparación la inicia un administrador, manager o el gerente de operaciones. Mientras tanto podés cargar recetas.</Notice>
              )}
            </>
          ) : (
            <p>Sede en preparación: las ventas todavía no descuentan.</p>
          )}
        </Step>

        <Step n={2} current={step === 2} done={recipesDone} title="Recetas de los platos que más se venden">
          <Progress value={ready} max={cov.total} label={`${ready} de ${cov.total} platos con receta lista`} />
          <p>Un plato sin receta se vende igual; solo que no descuenta insumos. Cargá primero los que más salen.</p>
          {overview.dishesToSetup.length > 0 && (
            <ul className="space-y-2">
              {overview.dishesToSetup.slice(0, 6).map((d) => (
                <li key={d.menuItemId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-border p-3">
                  <div className="min-w-0">
                    <p className="font-bold">{d.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {d.soldLast30d > 0 ? `${d.soldLast30d} vendidos en 30 días · ` : ''}
                      {COVERAGE_TEXT[d.coverage]}
                      {d.pendingVariants.length > 0 && `: ${d.pendingVariants.join(', ')}`}
                    </p>
                  </div>
                  {ctx.caps.recipes && (d.coverage === 'no_recipe' || d.coverage === 'variants_pending') && (
                    <button type="button" className={btnSecondary} onClick={() => ctx.open({ type: 'recipe', menuItemId: d.menuItemId, variantName: d.pendingVariants[0] ?? null })}>
                      {d.coverage === 'no_recipe' ? 'Cargar receta' : 'Revisar variantes'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {ctx.caps.recipes && (
            <button type="button" className={btnSecondary} onClick={() => ctx.goTo('recetas')}>
              Ver todos los platos
            </button>
          )}
        </Step>

        <Step n={3} current={step === 3} done={countsDone} title="Conteo inicial">
          <p>Contá una vez los insumos de esas recetas. Desde ahí el sistema los sigue solo y te pide verificar solo lo que importa.</p>
          {status === 'off' ? (
            <p className="text-muted-foreground">Disponible cuando la sede esté en preparación.</p>
          ) : missingCounts.length === 0 ? (
            recipesDone && <p className="font-semibold">Los insumos de las recetas cargadas ya tienen conteo.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {missingCounts.slice(0, 10).map((m) => (
                <li key={m.skuId} className="flex items-center justify-between gap-2 rounded-xl border-2 border-border p-3">
                  <span className="font-bold">{m.name}</span>
                  {ctx.caps.capture && (
                    <button type="button" className={btnSecondary} onClick={() => ctx.open({ type: 'count', skuId: m.skuId, storageLocationId: null })}>
                      <ClipboardCheck size={18} aria-hidden /> Contar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Step>

        <Step n={4} current={step === 4} done={false} title="Activar el descuento automático">
          <p>
            Al activar, <strong>{ready}</strong> {ready === 1 ? 'plato va' : 'platos van'} a descontar insumos con cada venta.
            {cov.total - ready > 0 && ` ${cov.total - ready} siguen sin descontar hasta que les cargues la receta.`}
            {cov.needsCounts > 0 && ` ${cov.needsCounts} todavía tienen insumos sin conteo inicial: descuentan igual, pero el stock de esos insumos va a quedar sin línea base hasta contarlos.`}
          </p>
          {status === 'off' ? null : !ctx.caps.manage ? (
            <Notice tone="info">La activación la hace un administrador, manager o el gerente de operaciones.</Notice>
          ) : confirmActivate ? (
            <div role="group" aria-label="Confirmar activación" className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">¿Activar? Desde este momento las ventas de {ctx.location.name} descuentan insumos.</span>
              <button type="button" className={btnPrimary} onClick={() => changeState('activate')} disabled={busy} autoFocus>
                {busy ? <Spinner label="Activando" /> : <Power size={18} aria-hidden />} Sí, activar
              </button>
              <button type="button" className={btnSecondary} onClick={() => setConfirmActivate(false)}>
                Todavía no
              </button>
            </div>
          ) : (
            <button type="button" className={btnPrimary} onClick={() => setConfirmActivate(true)} disabled={ready === 0}>
              <Power size={18} aria-hidden /> Activar inventario
            </button>
          )}
          {status !== 'off' && ready === 0 && ctx.caps.manage && <p className="text-sm text-muted-foreground">Cargá al menos una receta para activar.</p>}
        </Step>
      </ol>
    </section>
  )
}

function Step({ n, title, current, done, children }: { n: number; title: string; current: boolean; done: boolean; children: React.ReactNode }) {
  return (
    <li aria-current={current ? 'step' : undefined} className={`rounded-2xl border-2 p-5 ${current ? 'border-primary' : 'border-border'}`}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span aria-hidden className={`flex size-8 items-center justify-center rounded-full text-sm font-black ${done ? 'bg-emerald-600 text-white' : current ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
          {done ? <CheckCircle2 size={18} /> : n}
        </span>
        <h3 className="text-base font-black">
          <span className="sr-only">Paso {n}: </span>
          {title}
        </h3>
        {done && <StatusTag tone="ok">Hecho</StatusTag>}
        {current && !done && <StatusTag tone="info">Paso actual</StatusTag>}
      </div>
      <div className="space-y-3 text-sm">{children}</div>
    </li>
  )
}

function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div>
      <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label} className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-sm font-semibold">{label}</p>
    </div>
  )
}

function uniqueBy<T>(list: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>()
  return list.filter((x) => {
    const k = key(x)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
