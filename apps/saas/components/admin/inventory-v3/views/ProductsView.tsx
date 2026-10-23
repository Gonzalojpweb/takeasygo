'use client'

// ============================================================================
// Productos — insumos, existencias estimadas y su estado
// ============================================================================
// Lista compacta y buscable. Cada fila abre el detalle en el panel (nunca se
// expande en la lista). "Sin conteo", "sin stock" y "no se pudo cargar" son
// tres estados distintos, con texto (no solo color).
// ============================================================================

import { useMemo, useState } from 'react'
import { ChevronRight, PackageOpen, Search } from 'lucide-react'
import { invApi } from '../data/api'
import { useResource } from '../data/useResource'
import type { StockData } from '../data/types'
import { estimateText } from '@/lib/inventory/ui/format'
import { needsAttention, productState, type ProductStateView } from '@/lib/inventory/ui/product-status'
import { EmptyBlock, ErrorBlock, LoadingBlock, Notice, StatusTag, FilterChip, btnPrimary, inputClass } from '../ui'
import { SkuIcon } from '../visual'
import type { V3Context } from '../InventoryV3'

type Filter = 'all' | 'attention' | 'no_data'

interface Item {
  key: string
  skuId: string
  storageLocationId: string | null
  name: string
  category: string
  storageName: string | null
  main: string
  range: string | null
  state: ProductStateView
}

export default function ProductsView({ ctx }: { ctx: V3Context }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const stock = useResource(
    ctx.location.status === 'off' ? null : `${ctx.tenantSlug}|stock|${ctx.location.id}|${ctx.version}`,
    (signal) => invApi<StockData>(ctx.tenantSlug, `stock?locationId=${ctx.location.id}`, { signal }),
  )

  const items = useMemo<Item[]>(() => {
    if (!stock.data) return []
    const rows: Item[] = stock.data.rows.map((r) => {
      const est = estimateText(r.belief, r.unit)
      return {
        key: `${r.skuId}|${r.storageLocationId}`,
        skuId: r.skuId,
        storageLocationId: r.storageLocationId,
        name: r.name,
        category: r.category,
        storageName: r.storageName,
        main: est.main,
        range: est.range,
        state: productState(r),
      }
    })
    const untouched: Item[] = stock.data.untouched.map((u) => ({
      key: `${u.skuId}|-`,
      skuId: u.skuId,
      storageLocationId: null,
      name: u.name,
      category: u.category,
      storageName: null,
      main: 'Sin conteo inicial',
      range: null,
      state: { state: 'no_data', label: 'Sin conteo inicial', tone: 'neutral', rank: 3 },
    }))
    return [...rows, ...untouched].sort((a, b) => a.state.rank - b.state.rank || a.name.localeCompare(b.name, 'es'))
  }, [stock.data])

  if (ctx.location.status === 'off') {
    return (
      <EmptyBlock icon={<PackageOpen size={32} />} title="Esta sede todavía no tiene inventario" action={
        <button type="button" className={btnPrimary} onClick={() => ctx.goTo('ahora')}>Ver la puesta en marcha</button>
      }>
        Primero hay que preparar la sede desde «Ahora».
      </EmptyBlock>
    )
  }
  if (stock.status === 'loading') return <LoadingBlock label="Cargando productos" rows={5} />
  if (stock.status === 'error' && !stock.data) return <ErrorBlock error={stock.error} onRetry={stock.reload} what="los productos" />

  const q = query.trim().toLowerCase()
  const visible = items.filter(
    (i) =>
      (!q || i.name.toLowerCase().includes(q)) &&
      (filter === 'all' || (filter === 'attention' ? needsAttention(i.state) && i.state.state !== 'no_data' : i.state.state === 'no_data')),
  )
  const counts = {
    attention: items.filter((i) => needsAttention(i.state) && i.state.state !== 'no_data').length,
    no_data: items.filter((i) => i.state.state === 'no_data').length,
  }

  return (
    <div className="space-y-4">
      {stock.status === 'error' && <Notice tone="error">No se pudo actualizar la lista: {stock.error.message}</Notice>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <label htmlFor="product-search" className="sr-only">
            Buscar producto
          </label>
          <Search size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input id="product-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto…" className={`${inputClass} pl-10`} />
        </div>
        <div role="group" aria-label="Filtrar productos" className="flex flex-wrap items-center gap-2">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>Todos ({items.length})</FilterChip>
          <FilterChip active={filter === 'attention'} onClick={() => setFilter('attention')}>Atención ({counts.attention})</FilterChip>
          <FilterChip active={filter === 'no_data'} onClick={() => setFilter('no_data')}>Sin conteo ({counts.no_data})</FilterChip>
          <button type="button" className="min-h-11 px-2 text-sm font-bold text-primary underline-offset-2 hover:underline" onClick={() => ctx.help('productos')}>
            ¿Qué significa cada estado?
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyBlock icon={<PackageOpen size={32} />} title="Todavía no hay productos">
          Se agregan al cargar recetas o al recibir mercadería.
        </EmptyBlock>
      ) : visible.length === 0 ? (
        <EmptyBlock icon={<Search size={28} />} title="Nada coincide con la búsqueda" />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border-2 border-border bg-card" aria-label="Productos">
          {visible.map((i) => (
            <li key={i.key}>
              <button
                type="button"
                onClick={() => ctx.open({ type: 'product', skuId: i.skuId, storageLocationId: i.storageLocationId })}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-primary/40"
              >
                <SkuIcon category={i.category} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{i.name}</span>
                  {i.storageName && ctx.storages.length > 1 && <span className="block text-xs text-muted-foreground">{i.storageName}</span>}
                  <span className="block text-sm font-semibold tabular-nums text-muted-foreground sm:hidden">{i.main}</span>
                </span>
                <span className="hidden text-right sm:block">
                  <span className="block font-black tabular-nums">{i.main}</span>
                  {i.range && <span className="block text-xs text-muted-foreground">{i.range}</span>}
                </span>
                <StatusTag tone={i.state.tone}>{i.state.label}</StatusTag>
                <ChevronRight size={18} aria-hidden className="shrink-0 text-muted-foreground" />
                <span className="sr-only">Ver detalle</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
