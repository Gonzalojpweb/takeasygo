'use client'

// ============================================================================
// Recetas — platos del menú, ordenados por lo que más se vende
// ============================================================================
// Lista buscable con filtro por estado; cada plato abre el editor en el
// panel. La cobertura de variantes se ve en la fila. Las recetas huérfanas
// (plato o variante que ya no está en el menú, R9) se muestran aparte.
// ============================================================================

import { useState } from 'react'
import { ChefHat, ChevronRight, CookingPot, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { invApi } from '../data/api'
import { useResource } from '../data/useResource'
import type { DishCoverage, DishView, RecipesData } from '../data/types'
import { EmptyBlock, ErrorBlock, LoadingBlock, Notice, Spinner, StatusTag, FilterChip, btnSecondary, inputClass } from '../ui'
import { DishThumb, ProgressBar } from '../visual'
import { cn } from '@/lib/utils'
import type { V3Context } from '../InventoryV3'

type Filter = 'all' | 'pending' | 'ready'
type Section = 'dishes' | 'modifiers' | 'preparations'

interface ModifierRule {
  optionName: string
  groupName: string | null
  items: Array<{ skuId: string; quantity: number; unit: string }>
  isActive: boolean
}

const COVERAGE: Record<DishCoverage, { label: string; pill: string; action: string }> = {
  controlled: { label: 'Receta completa', pill: 'bg-emerald-50 text-emerald-800 border-emerald-600/30 dark:bg-emerald-950/40 dark:text-emerald-200', action: 'Editar' },
  needs_counts: { label: 'Descuenta · falta conteo inicial', pill: 'bg-sky-50 text-sky-800 border-sky-600/30 dark:bg-sky-950/40 dark:text-sky-200', action: 'Editar' },
  variants_pending: { label: 'Variantes sin confirmar', pill: 'bg-amber-50 text-amber-900 border-amber-600/30 dark:bg-amber-950/40 dark:text-amber-100', action: 'Completar' },
  no_recipe: { label: 'Sin receta', pill: 'bg-orange-50 text-orange-800 border-orange-600/30 dark:bg-orange-950/40 dark:text-orange-200', action: 'Cargar receta' },
}

const isPending = (d: DishView) => d.coverage === 'no_recipe' || d.coverage === 'variants_pending'

export default function RecipesView({ ctx }: { ctx: V3Context }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [removing, setRemoving] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [section, setSection] = useState<Section>('dishes')
  const rules = useResource(section === 'modifiers' ? `${ctx.tenantSlug}|modifier-rules|${ctx.version}` : null, (signal) =>
    invApi<{ rules: ModifierRule[] }>(ctx.tenantSlug, 'modifier-rules', { signal }),
  )
  const data = useResource(`${ctx.tenantSlug}|recipes|${ctx.location.id}|${ctx.version}`, (signal) =>
    invApi<RecipesData>(ctx.tenantSlug, `recipes?locationId=${ctx.location.id}`, { signal }),
  )

  if (data.status === 'loading') return <LoadingBlock label="Cargando recetas" rows={5} />
  if (data.status === 'error' && !data.data) return <ErrorBlock error={data.error} onRetry={data.reload} what="las recetas" />
  const r = data.data!

  const q = query.trim().toLowerCase()
  const visible = r.items.filter(
    (d) =>
      (!q || d.name.toLowerCase().includes(q) || d.categoryName.toLowerCase().includes(q)) &&
      (filter === 'all' || (filter === 'pending' ? isPending(d) : !isPending(d))),
  )
  const pendingCount = r.items.filter(isPending).length
  const ready = r.coverage.controlled + r.coverage.needsCounts

  async function removeOrphan(recipeKey: string) {
    setRemoving(recipeKey)
    setRemoveError(null)
    const res = await invApi(ctx.tenantSlug, `recipes?recipeKey=${encodeURIComponent(recipeKey)}`, { method: 'DELETE' })
    setRemoving(null)
    if (!res.ok) setRemoveError(res.error.message)
    else data.reload()
  }

  const options = [...new Set(r.items.flatMap((d) => d.modifiers))].sort((a, b) => a.localeCompare(b, 'es'))

  const sectionPicker = (
    <div role="group" aria-label="Qué querés ver" className="flex flex-wrap gap-2">
      <FilterChip active={section === 'dishes'} onClick={() => setSection('dishes')}>Platos ({r.items.length})</FilterChip>
      <FilterChip active={section === 'modifiers'} onClick={() => setSection('modifiers')}>Opciones del menú ({options.length})</FilterChip>
      <FilterChip active={section === 'preparations'} onClick={() => setSection('preparations')}>Preparaciones ({r.preparations.length})</FilterChip>
    </div>
  )

  if (section === 'modifiers') {
    return (
      <div className="space-y-5">
        {sectionPicker}
        <p className="max-w-2xl text-sm text-muted-foreground">
          Opciones que cambian lo que lleva un plato: «Extra queso» suma queso, «Sin cebolla» la resta. Se aplican por porción, en todos los platos donde aparezcan.
        </p>
        {options.length === 0 ? (
          <EmptyBlock icon={<SlidersHorizontal size={28} />} title="El menú no tiene opciones de personalización" />
        ) : rules.status === 'loading' ? (
          <LoadingBlock rows={4} label="Cargando opciones" />
        ) : rules.status === 'error' && !rules.data ? (
          <ErrorBlock error={rules.error} onRetry={rules.reload} what="las opciones" />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border-2 border-border bg-card" aria-label="Opciones del menú">
            {options.map((o) => {
              const rule = rules.data?.rules.find((x) => x.optionName.toLowerCase() === o.toLowerCase() && x.groupName === null)
              const active = Boolean(rule?.isActive)
              return (
                <li key={o}>
                  <button
                    type="button"
                    onClick={() => ctx.open({ type: 'modifier', optionName: o })}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-primary/40"
                  >
                    <span className="min-w-0 flex-1 truncate font-bold">{o}</span>
                    <StatusTag tone={active ? 'ok' : 'neutral'}>{active ? `Cambia ${rule!.items.length} ${rule!.items.length === 1 ? 'insumo' : 'insumos'}` : 'Sin efecto en insumos'}</StatusTag>
                    <ChevronRight size={18} aria-hidden className="shrink-0 text-muted-foreground" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    )
  }

  if (section === 'preparations') {
    return (
      <div className="space-y-5">
        {sectionPicker}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Lo que se elabora en la cocina (salsas, masas, caldos): una tanda usa insumos y rinde un elaborado que después usan los platos.
          </p>
          <div className="flex flex-wrap gap-2">
            {ctx.caps.capture && r.preparations.length > 0 && (
              <button type="button" className={btnSecondary} onClick={() => ctx.open({ type: 'production' })}>
                <CookingPot size={18} aria-hidden /> Registrar producción
              </button>
            )}
            <button type="button" className={btnSecondary} onClick={() => ctx.open({ type: 'preparation' })}>
              <Plus size={18} aria-hidden /> Nueva preparación
            </button>
          </div>
        </div>
        {r.preparations.length === 0 ? (
          <EmptyBlock icon={<CookingPot size={28} />} title="Todavía no hay preparaciones">
            Cargalas si en la cocina elaboran salsas, masas o caldos que después usan los platos.
          </EmptyBlock>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border-2 border-border bg-card" aria-label="Preparaciones">
            {r.preparations.map((p) => (
              <li key={p.recipeId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{p.name}</span>
                  <span className="block text-sm text-muted-foreground">{p.items.map((i) => i.skuName).join(', ')}</span>
                </span>
                {ctx.caps.capture && (
                  <button type="button" className={btnSecondary} onClick={() => ctx.open({ type: 'production', recipeId: p.recipeId })}>
                    Producir
                  </button>
                )}
                <button type="button" className={btnSecondary} onClick={() => ctx.open({ type: 'preparation', recipeId: p.recipeId })}>
                  Editar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {sectionPicker}
      {data.status === 'error' && <Notice tone="error">No se pudo actualizar: {data.error.message}</Notice>}
      <div className="rounded-2xl border-2 border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-muted-foreground">Configurar recetas</p>
            <p className="mt-1 text-2xl font-black">
              {ready} de {r.coverage.total} platos descuentan insumos
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {pendingCount === 0 ? 'Todo el menú está configurado.' : `Vinculá tus platos con sus ingredientes para activar el control automático. ${pendingCount} pendientes.`}
            </p>
          </div>
          <button type="button" className="min-h-11 text-sm font-bold text-primary underline-offset-2 hover:underline" onClick={() => ctx.help('recetas')}>
            ¿Cómo cargo una receta?
          </button>
        </div>
        <div className="mt-3">
          <ProgressBar
            value={r.coverage.total ? (ready / r.coverage.total) * 100 : 0}
            label="Platos con receta"
            tone={ready === r.coverage.total ? 'ok' : ready / Math.max(1, r.coverage.total) >= 0.5 ? 'warning' : 'danger'}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <label htmlFor="dish-search" className="sr-only">
            Buscar plato
          </label>
          <Search size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input id="dish-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar plato o categoría…" className={`${inputClass} pl-10`} />
        </div>
        <div role="group" aria-label="Filtrar platos" className="flex flex-wrap gap-2">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>Todos ({r.items.length})</FilterChip>
          <FilterChip active={filter === 'ready'} onClick={() => setFilter('ready')}>Con receta ({r.items.length - pendingCount})</FilterChip>
          <FilterChip active={filter === 'pending'} onClick={() => setFilter('pending')}>Pendientes ({pendingCount})</FilterChip>
        </div>
      </div>

      {r.items.length === 0 ? (
        <EmptyBlock icon={<ChefHat size={32} />} title="Esta sede no tiene menú cargado">
          Las recetas se arman sobre los platos del menú. Cargá el menú y volvé acá.
        </EmptyBlock>
      ) : visible.length === 0 ? (
        <EmptyBlock icon={<ChefHat size={28} />} title={filter === 'pending' && !q ? '¡No quedan platos pendientes!' : 'Nada coincide con la búsqueda'} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border-2 border-border bg-card" aria-label="Platos del menú">
          {visible.map((d) => {
            const c = COVERAGE[d.coverage]
            const confirmed = d.variantStates.filter((v) => v.status === 'own' || v.status === 'base_confirmed').length
            const firstPending = d.base ? d.variantStates.find((v) => v.status === 'variant_unconfirmed' || v.status === 'no_recipe')?.name ?? null : null
            return (
              <li key={d.menuItemId}>
                <button
                  type="button"
                  onClick={() => ctx.open({ type: 'recipe', menuItemId: d.menuItemId, variantName: firstPending })}
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-primary/40"
                >
                  <DishThumb imageUrl={d.imageUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{d.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      {d.categoryName}
                      {d.soldLast30d > 0 && ` · ${d.soldLast30d} vendidos en 30 días`}
                      {d.variantStates.length > 0 && ` · variantes ${confirmed}/${d.variantStates.length}`}
                    </span>
                    <span className={cn('mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold sm:hidden', c.pill)}>
                      <span aria-hidden className="size-1.5 rounded-full bg-current" /> {c.label}
                    </span>
                  </span>
                  <span className={cn('hidden items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold sm:inline-flex', c.pill)}>
                    <span aria-hidden className="size-1.5 rounded-full bg-current" /> {c.label}
                  </span>
                  <span
                    className={cn(
                      'hidden min-h-10 items-center rounded-xl border-2 px-3 text-sm font-bold md:inline-flex',
                      d.coverage === 'controlled' || d.coverage === 'needs_counts' ? 'border-border' : 'border-primary text-primary',
                    )}
                  >
                    {c.action}
                  </span>
                  <ChevronRight size={18} aria-hidden className="shrink-0 text-muted-foreground" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {r.orphans.length > 0 && (
        <section aria-labelledby="orphans-title" className="space-y-3">
          <h2 id="orphans-title" className="text-base font-black">
            Recetas que ya no están en el menú
          </h2>
          <p className="text-sm text-muted-foreground">
            No descuentan nada: el plato o la variante cambió de nombre o se quitó del menú. Si lo renombraste, cargá la receta en el plato nuevo y quitá esta.
          </p>
          {removeError && <Notice tone="error">{removeError}</Notice>}
          <ul className="space-y-2">
            {r.orphans.map((o) => (
              <li key={o.recipeKey} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-border p-3">
                <div>
                  <p className="font-bold">{o.name}</p>
                  <p className="text-sm text-muted-foreground">{o.reason === 'dish_missing' ? 'El plato ya no está en el menú' : `La variante «${o.variantName}» ya no existe`}</p>
                </div>
                <button type="button" className={btnSecondary} onClick={() => removeOrphan(o.recipeKey)} disabled={removing === o.recipeKey}>
                  {removing === o.recipeKey && <Spinner label="Quitando receta" />} Quitar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
