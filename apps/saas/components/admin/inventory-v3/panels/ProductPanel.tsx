'use client'

// ============================================================================
// Detalle de producto — cuánto hay (estimado), qué tan seguro, qué pasó
// ============================================================================
// Responde "¿por qué el sistema cree lo que cree?" con el historial del
// ledger, y ofrece las acciones del contexto: recibir, contar, merma.
// ============================================================================

import { ArrowRightLeft, ClipboardCheck, Settings2, SlidersHorizontal, Trash2, Truck } from 'lucide-react'
import { invApi } from '../data/api'
import { useResource } from '../data/useResource'
import type { HistoryEvent, StockData } from '../data/types'
import { CONFIDENCE_TEXT, estimateText, formatDelta, formatQty, pesos, relativeTime } from '@/lib/inventory/ui/format'
import { productState } from '@/lib/inventory/ui/product-status'
import { ErrorBlock, LoadingBlock, Notice, Panel, StatusTag, btnGhost, btnPrimary, btnSecondary } from '../ui'
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
  const storage = resolveStorage(ctx, storageLocationId)
  const sku = ctx.skus.find((s) => s._id === skuId)
  const stock = useResource(`${ctx.tenantSlug}|stock|${ctx.location.id}|${ctx.version}`, (signal) =>
    invApi<StockData>(ctx.tenantSlug, `stock?locationId=${ctx.location.id}`, { signal }),
  )
  const history = useResource(`${ctx.tenantSlug}|history|${skuId}|${storage}|${ctx.version}`, (signal) =>
    invApi<{ events: HistoryEvent[] }>(ctx.tenantSlug, `history/${skuId}?storageLocationId=${storage ?? ''}&limit=20`, { signal }),
  )

  const row = stock.data?.rows.find((r) => r.skuId === skuId && (!storage || r.storageLocationId === storage)) ?? null
  const name = row?.name ?? sku?.name ?? 'Producto'
  const unit = row?.unit ?? sku?.canonicalUnit ?? 'unit'

  return (
    <Panel
      open
      onOpenChange={(o) => !o && onClose()}
      title={name}
      description={row ? row.storageName : undefined}
      footer={
        ctx.caps.capture ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" className={btnPrimary} onClick={() => onSwitch({ type: 'count', skuId, storageLocationId: storage })}>
              <ClipboardCheck size={18} aria-hidden /> Contar
            </button>
            <button type="button" className={btnSecondary} onClick={() => onSwitch({ type: 'receive', skuId })}>
              <Truck size={18} aria-hidden /> Recibir
            </button>
            <button type="button" className={btnSecondary} onClick={() => onSwitch({ type: 'waste', skuId, storageLocationId: storage })}>
              <Trash2 size={18} aria-hidden /> Merma
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {stock.status === 'loading' && <LoadingBlock label="Cargando el producto" rows={2} />}
        {stock.status === 'error' && <ErrorBlock error={stock.error} onRetry={stock.reload} what="el producto" />}
        {stock.status === 'ready' && !row && (
          <Notice tone="info">
            Todavía no tiene movimientos en esta sede. Con un primer conteo o una recepción, el sistema empieza a seguirlo.
          </Notice>
        )}
        {row && <Summary row={row} unit={unit} showMoney={ctx.caps.read} />}

        {ctx.caps.manage && (
          <section aria-label="Gestión" className="flex flex-wrap gap-2">
            <button type="button" className={btnGhost} onClick={() => onSwitch({ type: 'adjust', skuId, storageLocationId: storage })}>
              <SlidersHorizontal size={18} aria-hidden /> Ajustar
            </button>
            <button type="button" className={btnGhost} onClick={() => onSwitch({ type: 'transfer', skuId, storageLocationId: storage })}>
              <ArrowRightLeft size={18} aria-hidden /> Transferir
            </button>
            <button type="button" className={btnGhost} onClick={() => onSwitch({ type: 'sku-settings', skuId })}>
              <Settings2 size={18} aria-hidden /> Configurar insumo
            </button>
          </section>
        )}

        <section aria-labelledby="hist-title" className="space-y-3">
          <h3 id="hist-title" className="text-base font-black">
            Qué pasó
          </h3>
          {history.status === 'loading' && <LoadingBlock label="Cargando movimientos" rows={2} />}
          {history.status === 'error' && <ErrorBlock error={history.error} onRetry={history.reload} what="los movimientos" />}
          {history.status === 'ready' && history.data.events.length === 0 && <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p>}
          {history.status === 'ready' && history.data.events.length > 0 && (
            <ol className="space-y-2">
              {history.data.events.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-bold">{EVENT_TEXT[h.eventType] ?? h.eventType}</p>
                    {h.detail && <p className="text-muted-foreground">{h.detail}</p>}
                    <p className="text-xs text-muted-foreground">
                      <time dateTime={h.occurredAt}>{relativeTime(h.occurredAt)}</time>
                    </p>
                  </div>
                  <span className="shrink-0 font-bold tabular-nums">
                    {h.observed !== null ? `contado ${formatQty(h.observed, unit)}` : h.quantity !== null ? formatDelta(h.quantity, unit) : ''}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Panel>
  )
}

function Summary({ row, unit, showMoney }: { row: StockData['rows'][number]; unit: string; showMoney: boolean }) {
  const est = estimateText(row.belief, unit)
  const state = productState(row)
  const conf = CONFIDENCE_TEXT[row.confidence] ?? CONFIDENCE_TEXT.unknown
  return (
    <section aria-label="Estado del producto" className="space-y-4">
      <div className="rounded-2xl bg-muted/50 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">El sistema estima</p>
        <p className="mt-1 text-3xl font-black">{est.main}</p>
        {est.range && <p className="text-sm text-muted-foreground">Con el margen actual: {est.range}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusTag tone={state.tone}>{state.label}</StatusTag>
          <StatusTag tone={row.confidence === 'high' ? 'ok' : row.confidence === 'unknown' ? 'neutral' : 'warning'}>{conf.label}</StatusTag>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{conf.hint}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="font-bold">Uso diario</dt>
          <dd className="text-muted-foreground">{row.belief.dailyUsage > 0 ? `~${formatQty(row.belief.dailyUsage, unit)}` : 'Sin datos aún'}</dd>
        </div>
        <div>
          <dt className="font-bold">Alcanza para</dt>
          <dd className="text-muted-foreground">{row.coverageDays !== null ? `~${row.coverageDays} días` : '—'}</dd>
        </div>
        <div>
          <dt className="font-bold">Último conteo</dt>
          <dd className="text-muted-foreground">{row.belief.lastObservedAt ? relativeTime(row.belief.lastObservedAt) : 'Nunca'}</dd>
        </div>
        <div>
          <dt className="font-bold">Stock mínimo</dt>
          <dd className="text-muted-foreground">{row.parLevel !== null ? formatQty(row.parLevel, unit) : 'Sin definir'}</dd>
        </div>
        {showMoney && (
          <div>
            <dt className="font-bold">Valor estimado</dt>
            <dd className="text-muted-foreground">{pesos(row.valueCents)}</dd>
          </div>
        )}
      </dl>
    </section>
  )
}
