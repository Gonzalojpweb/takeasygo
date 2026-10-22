'use client'

// ============================================================================
// Recetas — platos del menú, ordenados por lo que más se vende
// ============================================================================
// Lista buscable con filtro por estado; cada plato abre el editor en el
// panel. La cobertura de variantes se ve en la fila. Las recetas huérfanas
// (plato o variante que ya no está en el menú, R9) se muestran aparte.
// ============================================================================

import { useState } from 'react'
import { ChefHat, ChevronRight, Search } from 'lucide-react'
import { invApi } from '../data/api'
import { useResource } from '../data/useResource'
import type { DishCoverage, DishView, RecipesData } from '../data/types'
import { EmptyBlock, ErrorBlock, LoadingBlock, Notice, Spinner, StatusTag, FilterChip, btnSecondary, inputClass } from '../ui'
import type { V3Context } from '../InventoryV3'

type Filter = 'all' | 'pending' | 'ready'

const COVERAGE: Record<DishCoverage, { tone: 'ok' | 'warning' | 'neutral'; label: string }> = {
  controlled: { tone: 'ok', label: 'Descuenta' },
  needs_counts: { tone: 'warning', label: 'Descuenta · falta conteo inicial' },
  variants_pending: { tone: 'warning', label: 'Variantes sin confirmar' },
  no_recipe: { tone: 'neutral', label: 'Sin receta' },
}

const isPending = (d: DishView) => d.coverage === 'no_recipe' || d.coverage === 'variants_pending'

export default function RecipesView({ ctx }: { ctx: V3Context }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('pending')
  const [removing, setRemoving] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const data = useResource(`${ctx.tenantSlug}|recipes|${ctx.location.id}|${ctx.version}`, (signal) =>
    invApi<RecipesData>(ctx.tenantSlug, `recipes?locationId=${ctx.location.id}`, { signal }),
  )

  if (data.status === 'loading') return <LoadingBlock label="Cargando recetas" rows={5} />
  if (data.status === 'error' && !data.data) return <ErrorBlock error={data.error} onRetry={data.reload} what="las recetas" />
  const r = data.data!
  if (r.items.length === 0) {
    return (
      <EmptyBlock icon={<ChefHat size={32} />} title="Esta sede no tiene menú cargado">
        Las recetas se arman sobre los platos del menú. Cargá el menú y volvé acá.
      </EmptyBlock>
    )
  }

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

  return (
    <div className="space-y-5">
      {data.status === 'error' && <Notice tone="error">No se pudo actualizar: {data.error.message}</Notice>}
      <div className="rounded-2xl border-2 border-border bg-card p-4">
        <p className="text-sm font-bold text-muted-foreground">Cobertura del menú</p>
        <p className="mt-1 text-2xl font-black">
          {ready} de {r.coverage.total} platos descuentan insumos
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {pendingCount === 0 ? 'Todo el menú está configurado.' : `${pendingCount} pendientes: sus ventas no descuentan hasta cargar o confirmar la receta.`}
        </p>
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
          <FilterChip active={filter === 'pending'} onClick={() => setFilter('pending')}>Pendientes ({pendingCount})</FilterChip>
          <FilterChip active={filter === 'ready'} onClick={() => setFilter('ready')}>Listos ({r.items.length - pendingCount})</FilterChip>
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>Todos ({r.items.length})</FilterChip>
        </div>
      </div>

      {visible.length === 0 ? (
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
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-primary/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{d.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      {d.categoryName}
                      {d.soldLast30d > 0 && ` · ${d.soldLast30d} vendidos en 30 días`}
                      {d.variantStates.length > 0 && ` · variantes ${confirmed}/${d.variantStates.length}`}
                    </span>
                  </span>
                  <StatusTag tone={c.tone}>{c.label}</StatusTag>
                  <ChevronRight size={18} aria-hidden className="shrink-0 text-muted-foreground" />
                  <span className="sr-only">Editar receta</span>
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
