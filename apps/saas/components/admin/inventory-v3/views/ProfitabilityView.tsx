'use client'

// ============================================================================
// Rentabilidad — cuánto deja cada plato (F5)
// ============================================================================
// «Esta sede»: precio, costo de la receta, margen y ganancia aportada en 30
// días, con los platos para revisar arriba. «Comparar sedes»: el mismo plato
// en cada sede (el costo cambia porque cada sede compra a su precio).
// La lógica vive en lib/inventory/profitability (servidor); acá solo se
// ordena, filtra y muestra.
// ============================================================================

import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronRight, Coins, Percent, Scale, Search, TrendingUp } from 'lucide-react'
import { invApi } from '../data/api'
import { useResource } from '../data/useResource'
import { EmptyBlock, ErrorBlock, FilterChip, LoadingBlock, Notice, StatusTag, inputClass, type Tone } from '../ui'
import { KpiTile } from '../visual'
import { pesos } from '@/lib/inventory/ui/format'
import { cn } from '@/lib/utils'
import type { V3Context } from '../InventoryV3'
import type { CompareRow, ProfitRow, ProfitStatus, ProfitSummary } from '@/lib/inventory/profitability'
import { FOOD_COST_HIGH_PCT, FOOD_COST_WATCH_PCT } from '@/lib/inventory/profitability'

type Mode = 'location' | 'compare'
type Sort = 'profit' | 'margin' | 'sold'
type Filter = 'all' | 'review'

const STATUS: Record<ProfitStatus, { label: string; tone: Tone }> = {
  healthy: { label: 'Rentable', tone: 'ok' },
  watch: { label: 'Vigilar', tone: 'warning' },
  high: { label: 'Costo alto', tone: 'danger' },
  loss: { label: 'Pierde plata', tone: 'danger' },
  incomplete: { label: 'Faltan costos', tone: 'info' },
  no_recipe: { label: 'Sin receta', tone: 'neutral' },
}

const NEEDS_REVIEW: ProfitStatus[] = ['loss', 'high', 'watch', 'incomplete']
const pct = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`)
const dishLabel = (r: { name: string; variantName: string | null }) => (r.variantName ? `${r.name} · ${r.variantName}` : r.name)

interface LocationData {
  rows: ProfitRow[]
  summary: ProfitSummary
}
interface CompareData {
  locations: Array<{ id: string; name: string; summary: ProfitSummary }>
  rows: CompareRow[]
  truncated: boolean
}

export default function ProfitabilityView({ ctx }: { ctx: V3Context }) {
  const canCompare = ctx.locations.length > 1
  const [mode, setMode] = useState<Mode>('location')
  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Cuánto deja cada plato: precio de la carta menos lo que cuesta su receta, con el costo promedio de cada insumo en la sede.
        Food cost sano: hasta {FOOD_COST_WATCH_PCT}%; más de {FOOD_COST_HIGH_PCT}% es caro.
      </p>
      {canCompare && (
        <div role="group" aria-label="Qué querés ver" className="flex flex-wrap gap-2">
          <FilterChip active={mode === 'location'} onClick={() => setMode('location')}>{ctx.location.name}</FilterChip>
          <FilterChip active={mode === 'compare'} onClick={() => setMode('compare')}>Comparar sedes</FilterChip>
        </div>
      )}
      {mode === 'compare' && canCompare ? <CompareTable ctx={ctx} /> : <LocationTable ctx={ctx} />}
    </div>
  )
}

function LocationTable({ ctx }: { ctx: V3Context }) {
  const [sort, setSort] = useState<Sort>('profit')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const data = useResource(`${ctx.tenantSlug}|profit|${ctx.location.id}|${ctx.version}`, (signal) =>
    invApi<LocationData>(ctx.tenantSlug, `profitability?locationId=${ctx.location.id}`, { signal }),
  )

  const rows = useMemo(() => {
    const all = data.data?.rows ?? []
    const q = query.trim().toLowerCase()
    const list = all.filter(
      (r) =>
        (!q || dishLabel(r).toLowerCase().includes(q) || r.categoryName.toLowerCase().includes(q)) &&
        (filter === 'all' || NEEDS_REVIEW.includes(r.status)),
    )
    // Los platos sin costo van siempre al final; entre ellos, por vendidos.
    const byNullable = (a: number | null, b: number | null) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b)
    return [...list].sort((a, b) => {
      if (sort === 'sold') return b.soldLast30d - a.soldLast30d
      const neg = (n: number | null) => (n === null ? null : -n)
      const primary = sort === 'margin' ? byNullable(a.marginPct, b.marginPct) : byNullable(neg(a.profitLast30dCents), neg(b.profitLast30dCents))
      return primary || b.soldLast30d - a.soldLast30d
    })
  }, [data.data, query, filter, sort])

  if (data.status === 'loading') return <LoadingBlock label="Calculando rentabilidad" rows={5} />
  if (data.status === 'error' && !data.data) return <ErrorBlock error={data.error} onRetry={data.reload} what="la rentabilidad" />
  const { summary } = data.data!
  const reviewCount = data.data!.rows.filter((r) => NEEDS_REVIEW.includes(r.status)).length

  if (summary.dishes === 0) {
    return (
      <EmptyBlock icon={<Coins size={28} />} title="Esta sede no tiene menú cargado">
        La rentabilidad se calcula sobre los platos del menú y sus recetas.
      </EmptyBlock>
    )
  }

  return (
    <div className="space-y-5">
      {data.status === 'error' && <Notice tone="error">No se pudo actualizar: {data.error.message}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          icon={Percent}
          tone={summary.weightedFoodCostPct === null ? 'neutral' : summary.weightedFoodCostPct > FOOD_COST_HIGH_PCT ? 'red' : summary.weightedFoodCostPct > FOOD_COST_WATCH_PCT ? 'orange' : 'green'}
          value={pct(summary.weightedMarginPct)}
          label="Margen promedio"
          hint={summary.weightedFoodCostPct === null ? 'Sin ventas de platos costeados en 30 días' : `Food cost ${pct(summary.weightedFoodCostPct)}, según lo que más se vende`}
        />
        <KpiTile icon={TrendingUp} tone="blue" value={pesos(summary.profitLast30dCents)} label="Ganancia de los platos" hint="Margen × vendidos, últimos 30 días" />
        <KpiTile
          icon={AlertTriangle}
          tone={summary.high + summary.loss > 0 ? 'red' : 'neutral'}
          value={String(summary.high + summary.loss)}
          label="Platos con costo alto"
          hint={summary.loss > 0 ? `${summary.loss} cuestan más de lo que se cobran` : `Food cost mayor a ${FOOD_COST_HIGH_PCT}%`}
          onClick={reviewCount > 0 ? () => setFilter('review') : undefined}
        />
        <KpiTile
          icon={Scale}
          tone={summary.noRecipe + summary.incomplete > 0 ? 'orange' : 'green'}
          value={`${summary.costed} de ${summary.dishes}`}
          label="Platos costeados"
          hint={summary.noRecipe + summary.incomplete > 0 ? `${summary.noRecipe} sin receta · ${summary.incomplete} con insumos sin costo` : 'Todo el menú tiene costo'}
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="relative flex-1">
          <label htmlFor="profit-search" className="sr-only">Buscar plato</label>
          <Search size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input id="profit-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar plato o categoría…" className={`${inputClass} pl-10`} />
        </div>
        <div role="group" aria-label="Filtrar platos" className="flex flex-wrap gap-2">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>Todos</FilterChip>
          <FilterChip active={filter === 'review'} onClick={() => setFilter('review')}>Para revisar ({reviewCount})</FilterChip>
        </div>
        <div role="group" aria-label="Ordenar" className="flex flex-wrap gap-2">
          <FilterChip active={sort === 'profit'} onClick={() => setSort('profit')}>Más ganancia</FilterChip>
          <FilterChip active={sort === 'margin'} onClick={() => setSort('margin')}>Menor margen</FilterChip>
          <FilterChip active={sort === 'sold'} onClick={() => setSort('sold')}>Más vendidos</FilterChip>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyBlock icon={<Coins size={28} />} title={filter === 'review' && !query ? 'No hay platos para revisar' : 'Nada coincide con la búsqueda'} />
      ) : (
        <div className="overflow-hidden rounded-2xl border-2 border-border bg-card">
          <div className="hidden grid-cols-[minmax(0,2.4fr)_repeat(5,minmax(0,1fr))_auto] gap-3 border-b border-border bg-muted/40 px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground md:grid" aria-hidden>
            <span>Plato</span>
            <span className="text-right">Precio</span>
            <span className="text-right">Costo</span>
            <span className="text-right">Margen</span>
            <span className="text-right">Vendidos 30 d</span>
            <span className="text-right">Ganancia 30 d</span>
            <span className="w-4" />
          </div>
          <ul className="divide-y divide-border" aria-label="Rentabilidad por plato">
            {rows.map((r) => {
              const s = STATUS[r.status]
              return (
                <li key={r.key}>
                  <button
                    type="button"
                    onClick={() => ctx.open({ type: 'recipe', menuItemId: r.menuItemId, variantName: r.variantName })}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-primary/40 md:grid-cols-[minmax(0,2.4fr)_repeat(5,minmax(0,1fr))_auto]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{dishLabel(r)}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <StatusTag tone={s.tone}>{s.label}</StatusTag>
                        <span className="truncate">{r.categoryName}</span>
                      </span>
                    </span>
                    {/* Celular: resumen en una línea */}
                    <span className="text-right text-sm md:hidden">
                      <span className="block font-black tabular-nums">{pct(r.marginPct)}</span>
                      <span className="block text-muted-foreground tabular-nums">{r.costCents !== null ? `${pesos(r.costCents)} de ${pesos(r.priceCents)}` : pesos(r.priceCents)}</span>
                    </span>
                    <span className="hidden text-right tabular-nums md:block">{pesos(r.priceCents)}</span>
                    <span className="hidden text-right tabular-nums md:block">{r.costCents !== null ? pesos(r.costCents) : '—'}</span>
                    <span className="hidden text-right md:block">
                      <span className="block font-bold tabular-nums">{r.marginCents !== null ? pesos(r.marginCents) : '—'}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">{pct(r.marginPct)}</span>
                    </span>
                    <span className="hidden text-right tabular-nums md:block">{r.soldLast30d}</span>
                    <span className={cn('hidden text-right font-bold tabular-nums md:block', (r.profitLast30dCents ?? 0) < 0 && 'text-red-700 dark:text-red-300')}>
                      {r.profitLast30dCents !== null ? pesos(r.profitLast30dCents) : '—'}
                    </span>
                    <ChevronRight size={18} aria-hidden className="hidden shrink-0 text-muted-foreground md:block" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {summary.incomplete > 0 && (
        <p className="text-sm text-muted-foreground">«Faltan costos»: la receta usa insumos sin precio. Cargalos al recibir mercadería y el margen se calcula solo.</p>
      )}
    </div>
  )
}

function CompareTable({ ctx }: { ctx: V3Context }) {
  const [query, setQuery] = useState('')
  const data = useResource(`${ctx.tenantSlug}|profit-compare|${ctx.version}`, (signal) =>
    invApi<CompareData>(ctx.tenantSlug, 'profitability?compare=1', { signal }),
  )
  if (data.status === 'loading') return <LoadingBlock label="Comparando sedes" rows={5} />
  if (data.status === 'error' && !data.data) return <ErrorBlock error={data.error} onRetry={data.reload} what="la comparación" />
  const { locations, rows, truncated } = data.data!
  const q = query.trim().toLowerCase()
  const visible = rows.filter((r) => !q || dishLabel(r).toLowerCase().includes(q) || r.categoryName.toLowerCase().includes(q))

  return (
    <div className="space-y-5">
      {truncated && <Notice tone="info">Se comparan las primeras {locations.length} sedes por nombre.</Notice>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {locations.map((l) => (
          <div key={l.id} className="rounded-2xl border-2 border-border bg-card p-4">
            <p className="truncate font-bold">{l.name}</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{pct(l.summary.weightedMarginPct)}</p>
            <p className="text-sm text-muted-foreground">
              Margen promedio · {l.summary.costed} de {l.summary.dishes} platos costeados
            </p>
          </div>
        ))}
      </div>

      <div className="relative">
        <label htmlFor="compare-search" className="sr-only">Buscar plato</label>
        <Search size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input id="compare-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar plato o categoría…" className={`${inputClass} pl-10`} />
      </div>

      {rows.length === 0 ? (
        <EmptyBlock icon={<Scale size={28} />} title="No hay platos en común entre las sedes">
          Se comparan los platos que tienen el mismo nombre en dos o más sedes.
        </EmptyBlock>
      ) : visible.length === 0 ? (
        <EmptyBlock icon={<Scale size={28} />} title="Nada coincide con la búsqueda" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border-2 border-border bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">El mismo plato en cada sede: costo de la receta y margen</caption>
            <thead className="bg-muted/40 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="sticky left-0 bg-muted px-4 py-2 text-left">Plato</th>
                {locations.map((l) => (
                  <th key={l.id} scope="col" className="px-3 py-2 text-right">{l.name}</th>
                ))}
                <th scope="col" className="px-3 py-2 text-right">Diferencia de costo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((r) => (
                <tr key={r.key}>
                  <th scope="row" className="sticky left-0 bg-card px-4 py-3 text-left font-bold">
                    <span className="block max-w-[14rem] truncate">{dishLabel(r)}</span>
                    <span className="block text-xs font-normal text-muted-foreground">{r.categoryName}</span>
                  </th>
                  {r.cells.map((c, i) => (
                    <td
                      key={locations[i].id}
                      className={cn('px-3 py-3 text-right tabular-nums', c && r.priciestLocationId === c.locationId && 'bg-red-50 dark:bg-red-950/30')}
                    >
                      {!c ? (
                        <span className="text-muted-foreground">No está</span>
                      ) : c.costCents === null ? (
                        <span className="text-muted-foreground">Sin receta</span>
                      ) : (
                        <>
                          <span className="block font-bold">{pesos(c.costCents)}</span>
                          <span className="block text-xs text-muted-foreground">
                            {c.status === 'incomplete' ? 'Faltan costos' : `margen ${pct(c.marginPct)}`}
                            {r.priciestLocationId === c.locationId && <span className="sr-only"> (la sede más cara)</span>}
                          </span>
                        </>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-right tabular-nums">
                    {r.costSpreadCents === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <>
                        <span className="block font-bold">{pesos(r.costSpreadCents)}</span>
                        <span className="block text-xs text-muted-foreground">{pct(r.costSpreadPct)} más cara</span>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Se comparan platos con el mismo nombre. Si una sede paga más un insumo, el costo del plato sube ahí: la celda en rojo es la sede donde el plato sale más caro.
      </p>
    </div>
  )
}
