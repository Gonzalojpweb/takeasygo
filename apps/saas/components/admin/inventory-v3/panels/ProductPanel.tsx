'use client'

// ============================================================================
// Ficha del insumo — cuánto hay, qué tan seguro, qué pasó y dónde se usa
// ============================================================================
// Referencia de diseño: inventoryUI.png (ficha «Carne picada»).
// · Arriba: stock actual grande + su estado; si está por acabarse, un aviso
//   con qué hacer.
// · Pestañas: Resumen (uso, duración, mínimo, valor) · Historia (cada
//   movimiento del registro) · Usos en recetas (qué platos lo descuentan).
// · Acciones del contexto: registrar mercadería, contar, merma; y la gestión
//   (ajustar, transferir, configurar) para quien puede.
// ============================================================================

import { useState } from 'react'
import { AlertTriangle, ArrowRightLeft, ClipboardCheck, CircleHelp, Settings2, SlidersHorizontal, Trash2, Truck } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { invApi } from '../data/api'
import { useResource } from '../data/useResource'
import type { HistoryEvent, RecipesData, StockData } from '../data/types'
import { CONFIDENCE_TEXT, UNIT_SHORT, estimateText, formatDelta, formatQty, pesos, relativeTime } from '@/lib/inventory/ui/format'
import { productState } from '@/lib/inventory/ui/product-status'
import { ErrorBlock, LoadingBlock, Notice, Panel, StatusTag, btnGhost, btnPrimary, btnSecondary } from '../ui'
import { DishThumb, SkuIcon, categoryLook } from '../visual'
import { resolveStorage, type PanelProps } from './PanelHost'

const EVENT_TEXT: Record<string, string> = {
  GoodsReceived: 'Mercadería recibida',
  WasteRecorded: 'Merma',
  PhysicalCountObserved: 'Conteo',
  AdjustmentApplied: 'Ajuste autorizado',
  TransferOut: 'Transferencia enviada',
  TransferIn: 'Transferencia recibida',
  ProductionTransformed: 'Producción',
  SaleRecorded: 'Venta',
  SaleConsumed: 'Venta',
}

export default function ProductPanel({ ctx, onClose, onSwitch, skuId, storageLocationId }: PanelProps & { skuId: string; storageLocationId: string | null }) {
  const [tab, setTab] = useState('resumen')
  const storage = resolveStorage(ctx, storageLocationId)
  const sku = ctx.allSkus.find((s) => s._id === skuId)
  const stock = useResource(`${ctx.tenantSlug}|stock|${ctx.location.id}|${ctx.version}`, (signal) =>
    invApi<StockData>(ctx.tenantSlug, `stock?locationId=${ctx.location.id}`, { signal }),
  )
  const history = useResource(tab === 'historia' ? `${ctx.tenantSlug}|history|${skuId}|${storage}|${ctx.version}` : null, (signal) =>
    invApi<{ events: HistoryEvent[] }>(ctx.tenantSlug, `history/${skuId}?storageLocationId=${storage ?? ''}&limit=30`, { signal }),
  )
  const recipes = useResource(tab === 'usos' ? `${ctx.tenantSlug}|recipes|${ctx.location.id}|${ctx.version}` : null, (signal) =>
    invApi<RecipesData>(ctx.tenantSlug, `recipes?locationId=${ctx.location.id}`, { signal }),
  )

  const row = stock.data?.rows.find((r) => r.skuId === skuId && (!storage || r.storageLocationId === storage)) ?? null
  const name = row?.name ?? sku?.name ?? 'Insumo'
  const unit = row?.unit ?? sku?.canonicalUnit ?? 'unit'
  const category = row?.category ?? sku?.category ?? 'other'
  const state = row ? productState(row) : null
  const low = state && (state.state === 'low' || state.state === 'out' || state.state === 'negative')

  return (
    <Panel
      open
      onOpenChange={(o) => !o && onClose()}
      title={name}
      description={`${categoryLook(category).label}${row && ctx.storages.length > 1 ? ` · ${row.storageName}` : ''}`}
      footer={
        ctx.caps.capture ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" className={btnPrimary} onClick={() => onSwitch({ type: 'receive', skuId })}>
              <Truck size={18} aria-hidden /> Registrar mercadería
            </button>
            <button type="button" className={btnSecondary} onClick={() => onSwitch({ type: 'count', skuId, storageLocationId: storage })}>
              <ClipboardCheck size={18} aria-hidden /> Hacer conteo
            </button>
            <button type="button" className={btnSecondary} onClick={() => onSwitch({ type: 'waste', skuId, storageLocationId: storage })}>
              <Trash2 size={18} aria-hidden /> Merma
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {/* Stock actual */}
        <div className="flex items-stretch gap-4">
          <SkuIcon category={category} size="xl" />
          <div className="min-w-0 flex-1 rounded-2xl border-2 border-border p-4">
            {stock.status === 'loading' ? (
              <LoadingBlock label="Cargando el insumo" rows={1} />
            ) : stock.status === 'error' && !stock.data ? (
              <ErrorBlock error={stock.error} onRetry={stock.reload} what="el insumo" />
            ) : row ? (
              <StockHeadline row={row} unit={unit} />
            ) : (
              <div>
                <p className="text-sm font-bold text-muted-foreground">Stock actual</p>
                <p className="mt-1 text-lg font-black">Sin movimientos</p>
                <p className="text-sm text-muted-foreground">Con un primer conteo o una recepción, el sistema empieza a seguirlo.</p>
              </div>
            )}
          </div>
        </div>

        {low && row && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border-2 border-red-600/30 bg-red-50 p-4 text-red-900 dark:bg-red-950/30 dark:text-red-100">
            <AlertTriangle size={22} aria-hidden className="shrink-0" />
            <div>
              <p className="font-bold">{state!.state === 'negative' ? `Se vendió más ${name.toLowerCase()} de lo registrado` : `Te queda poco ${name.toLowerCase()}`}</p>
              <p className="text-sm">
                {state!.state === 'negative' ? 'Falta registrar una compra o la receta lleva más de lo cargado. Contalo para corregir.' : 'Registrá la mercadería que llegó o ajustá tu conteo.'}
              </p>
            </div>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab} className="gap-4">
          <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl bg-muted p-1">
            <TabsTrigger value="resumen" className="min-h-10 rounded-lg font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Resumen</TabsTrigger>
            <TabsTrigger value="historia" className="min-h-10 rounded-lg font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Historia</TabsTrigger>
            <TabsTrigger value="usos" className="min-h-10 rounded-lg font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Usos en recetas</TabsTrigger>
          </TabsList>

          <TabsContent value="resumen" className="space-y-4">
            {row ? <SummaryGrid row={row} unit={unit} showMoney={ctx.caps.read} supplier={sku?.supplierName ?? null} /> : <p className="text-sm text-muted-foreground">Todavía no hay datos para resumir.</p>}
            {ctx.caps.manage && (
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <button type="button" className={btnGhost} onClick={() => onSwitch({ type: 'adjust', skuId, storageLocationId: storage })}>
                  <SlidersHorizontal size={18} aria-hidden /> Ajustar
                </button>
                <button type="button" className={btnGhost} onClick={() => onSwitch({ type: 'transfer', skuId, storageLocationId: storage })}>
                  <ArrowRightLeft size={18} aria-hidden /> Transferir
                </button>
                <button type="button" className={btnGhost} onClick={() => onSwitch({ type: 'sku-settings', skuId })}>
                  <Settings2 size={18} aria-hidden /> Configurar insumo
                </button>
              </div>
            )}
            <button type="button" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-primary" onClick={() => ctx.help('estimacion')}>
              <CircleHelp size={16} aria-hidden /> ¿Por qué es una estimación?
            </button>
          </TabsContent>

          <TabsContent value="historia">
            {history.status === 'loading' && <LoadingBlock label="Cargando movimientos" rows={3} />}
            {history.status === 'error' && !history.data && <ErrorBlock error={history.error} onRetry={history.reload} what="los movimientos" />}
            {history.data && history.data.events.length === 0 && <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p>}
            {history.data && history.data.events.length > 0 && (
              <ol className="space-y-2">
                {history.data.events.map((h) => {
                  const qty = h.observed !== null ? `contado ${formatQty(h.observed, unit)}` : h.quantity !== null ? formatDelta(h.quantity, unit) : ''
                  const negative = h.observed === null && h.quantity !== null && h.quantity < 0
                  return (
                    <li key={h.id} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-bold">{EVENT_TEXT[h.eventType] ?? h.eventType}</p>
                        {h.detail && <p className="text-muted-foreground">{h.detail}</p>}
                        <p className="text-xs text-muted-foreground">
                          <time dateTime={h.occurredAt}>{relativeTime(h.occurredAt)}</time>
                        </p>
                      </div>
                      <span className={`shrink-0 font-bold tabular-nums ${negative ? 'text-red-700 dark:text-red-300' : h.observed !== null ? '' : 'text-emerald-700 dark:text-emerald-300'}`}>{qty}</span>
                    </li>
                  )
                })}
              </ol>
            )}
          </TabsContent>

          <TabsContent value="usos">
            {recipes.status === 'loading' && <LoadingBlock label="Buscando recetas" rows={3} />}
            {recipes.status === 'error' && !recipes.data && <ErrorBlock error={recipes.error} onRetry={recipes.reload} what="las recetas" />}
            {recipes.data && <Uses data={recipes.data} skuId={skuId} onOpen={(menuItemId, variantName) => onSwitch({ type: 'recipe', menuItemId, variantName })} canEdit={ctx.caps.recipes} />}
          </TabsContent>
        </Tabs>
      </div>
    </Panel>
  )
}

function StockHeadline({ row, unit }: { row: StockData['rows'][number]; unit: string }) {
  const est = estimateText(row.belief, unit)
  const state = productState(row)
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-bold text-muted-foreground">Stock actual</p>
        <StatusTag tone={state.tone}>{state.label}</StatusTag>
      </div>
      <p className={`mt-1 text-3xl font-black tabular-nums ${state.tone === 'danger' ? 'text-red-700 dark:text-red-300' : ''}`}>{est.main}</p>
      <p className="text-sm text-muted-foreground">{row.parLevel !== null ? `Stock mínimo: ${formatQty(row.parLevel, unit)}` : 'Sin stock mínimo definido'}</p>
    </div>
  )
}

function SummaryGrid({ row, unit, showMoney, supplier }: { row: StockData['rows'][number]; unit: string; showMoney: boolean; supplier: string | null }) {
  const est = estimateText(row.belief, unit)
  const conf = CONFIDENCE_TEXT[row.confidence] ?? CONFIDENCE_TEXT.unknown
  const items: Array<[string, string]> = [
    ['Unidad', UNIT_SHORT[unit] ?? unit],
    ['Uso diario', row.belief.dailyUsage > 0 ? `~${formatQty(row.belief.dailyUsage, unit)}` : 'Sin datos aún'],
    ['Alcanza para', row.coverageDays !== null ? `~${row.coverageDays} días` : '—'],
    ['Último conteo', row.belief.lastObservedAt ? relativeTime(row.belief.lastObservedAt) : 'Nunca'],
    ['Margen de la estimación', est.range ?? '—'],
    ['Confianza', conf.label],
  ]
  if (showMoney) items.push(['Valor estimado', pesos(row.valueCents)])
  if (supplier) items.push(['Proveedor', supplier])
  return (
    <section aria-label="Información" className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 rounded-2xl border-2 border-border p-4 text-sm sm:grid-cols-3">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-bold text-muted-foreground">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">{conf.hint}</p>
    </section>
  )
}

function Uses({ data, skuId, onOpen, canEdit }: { data: RecipesData; skuId: string; onOpen: (menuItemId: string, variantName: string | null) => void; canEdit: boolean }) {
  const uses: Array<{ key: string; menuItemId: string; variantName: string | null; name: string; imageUrl?: string | null; qty: string }> = []
  for (const d of data.items) {
    const recipes = [{ v: null as string | null, r: d.base }, ...d.variantStates.map((v) => ({ v: v.name, r: v.recipe }))]
    for (const { v, r } of recipes) {
      const item = r?.items.find((i) => i.skuId === skuId)
      if (item) uses.push({ key: `${d.menuItemId}|${v ?? ''}`, menuItemId: d.menuItemId, variantName: v, name: v ? `${d.name} · ${v}` : d.name, imageUrl: d.imageUrl, qty: formatQty(item.quantity, item.unit) })
    }
  }
  const preps = data.preparations.filter((p) => p.items.some((i) => i.skuId === skuId))
  if (uses.length === 0 && preps.length === 0) {
    return <Notice tone="info">Todavía no está en ninguna receta: sus existencias no bajan con las ventas.</Notice>
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Cada venta de estos platos descuenta la cantidad indicada por porción.</p>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border-2 border-border">
        {uses.map((u) => (
          <li key={u.key}>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => onOpen(u.menuItemId, u.variantName)}
              className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent"
            >
              <DishThumb imageUrl={u.imageUrl} />
              <span className="min-w-0 flex-1 truncate font-bold">{u.name}</span>
              <span className="shrink-0 text-sm font-bold tabular-nums">{u.qty}</span>
            </button>
          </li>
        ))}
        {preps.map((p) => (
          <li key={p.recipeId} className="flex min-h-14 items-center gap-3 px-3 py-2">
            <span aria-hidden className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-xs font-black text-muted-foreground">PREP</span>
            <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
            <span className="shrink-0 text-sm font-bold tabular-nums">{formatQty(p.items.find((i) => i.skuId === skuId)!.quantity, p.items.find((i) => i.skuId === skuId)!.unit)} por tanda</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
