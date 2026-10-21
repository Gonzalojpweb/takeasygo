'use client'

// ============================================================================
// Stock — creencia actual de cada insumo × depósito
// ============================================================================
// Cada fila muestra estimación ± incertidumbre, nivel de confianza en
// lenguaje operativo, cobertura en días y valor. "Historial" responde
// "¿por qué creemos lo que creemos?" con los eventos del ledger.
// ============================================================================

import { useMemo, useState } from 'react'
import { History, Loader2, Search } from 'lucide-react'
import QuickCapture from './QuickCapture'
import {
  CATEGORY_LABEL,
  ConfidenceBadge,
  EVENT_LABEL,
  EmptyState,
  METHOD_LABEL,
  SectionCard,
  estimate,
  fieldClass,
  inventoryApi,
  pesos,
  qty,
  useAsyncData,
} from './shared'

interface Row {
  skuId: string
  storageLocationId: string
  storageName: string
  name: string
  category: string
  unit: string
  belief: { mu: number; sigma: number; anchored: boolean; dailyUsage: number; lastObservedAt: string | null; flags: string[] }
  confidence: string
  stockAlert: 'out' | 'low' | null
  coverageDays: number | null
  valueCents: number
}

interface HistoryEvent {
  id: string
  eventType: string
  occurredAt: string
  source: string
  observationMethod: string | null
  quantity: number | null
  observed: number | null
  detail: string | null
}

type Panel = { key: string; kind: 'count' | 'waste' | 'history' } | null

export default function StockTab({ tenantSlug, locationId }: { tenantSlug: string; locationId: string }) {
  const [filter, setFilter] = useState('')
  const [panel, setPanel] = useState<Panel>(null)
  const [history, setHistory] = useState<HistoryEvent[] | null>(null)
  const { data, reload: load } = useAsyncData(
    async () => (await inventoryApi<{ rows: Row[] }>(tenantSlug, `stock?locationId=${locationId}`))?.rows ?? [],
    `${tenantSlug}|${locationId}`,
  )
  const rows = data

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return (rows ?? []).filter((r) => !f || r.name.toLowerCase().includes(f) || (CATEGORY_LABEL[r.category] ?? '').toLowerCase().includes(f))
  }, [rows, filter])

  async function openHistory(row: Row) {
    const key = `${row.skuId}|${row.storageLocationId}`
    if (panel?.key === key && panel.kind === 'history') return setPanel(null)
    setPanel({ key, kind: 'history' })
    setHistory(null)
    const res = await inventoryApi<{ events: HistoryEvent[] }>(tenantSlug, `history/${row.skuId}?storageLocationId=${row.storageLocationId}&limit=30`)
    setHistory(res?.events ?? [])
  }

  if (!rows) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>

  const totalValue = rows.reduce((s, r) => s + r.valueCents, 0)

  return (
    <SectionCard
      title="Stock estimado"
      subtitle={`Valor estimado: ${pesos(totalValue)}. Los números son estimaciones con su margen: se recalibran con cada conteo.`}
      actions={
        <label className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar insumo" className={`${fieldClass} pl-9 sm:w-64`} />
        </label>
      }
    >
      {visible.length === 0 ? (
        <EmptyState icon={<Search />} text="Sin insumos con movimientos en esta sede. Registrá un conteo inicial o una recepción para empezar." />
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((r) => {
            const key = `${r.skuId}|${r.storageLocationId}`
            return (
              <li key={key} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-[12rem]">
                    <div className="font-bold">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.storageName} · {CATEGORY_LABEL[r.category] ?? r.category}
                      {r.belief.dailyUsage > 0 && ` · usa ~${qty(r.belief.dailyUsage, r.unit)}/día`}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="text-right">
                      <div className={`font-black ${r.belief.mu < 0 ? 'text-red-600' : ''}`}>
                        {r.belief.anchored ? estimate(r.belief.mu, r.belief.sigma, r.unit) : `${qty(r.belief.mu, r.unit)} (solo movimientos)`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.coverageDays !== null ? `alcanza ~${r.coverageDays} días` : '—'} · {pesos(r.valueCents)}
                      </div>
                    </div>
                    <ConfidenceBadge level={r.confidence} />
                    <div className="flex gap-1">
                      <RowButton label="Contar" onClick={() => setPanel(panel?.key === key && panel.kind === 'count' ? null : { key, kind: 'count' })} />
                      <RowButton label="Merma" onClick={() => setPanel(panel?.key === key && panel.kind === 'waste' ? null : { key, kind: 'waste' })} />
                      <RowButton label={<History size={16} aria-label="Historial" />} onClick={() => openHistory(r)} />
                    </div>
                  </div>
                </div>

                {panel?.key === key && (panel.kind === 'count' || panel.kind === 'waste') && (
                  <QuickCapture
                    tenantSlug={tenantSlug}
                    skuId={r.skuId}
                    storageLocationId={r.storageLocationId}
                    unit={r.unit}
                    mode={panel.kind}
                    onDone={() => {
                      setPanel(null)
                      load()
                    }}
                  />
                )}

                {panel?.key === key && panel.kind === 'history' && (
                  <div className="mt-3 rounded-2xl bg-muted/30 p-3">
                    {!history ? (
                      <Loader2 className="mx-auto animate-spin text-muted-foreground" />
                    ) : history.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin movimientos.</p>
                    ) : (
                      <ul className="space-y-1.5 text-sm">
                        {history.map((h) => (
                          <li key={h.id} className="flex flex-wrap justify-between gap-2">
                            <span>
                              <span className="font-bold">{EVENT_LABEL[h.eventType] ?? h.eventType}</span>
                              {h.detail && <span className="text-muted-foreground"> · {h.detail}</span>}
                              {h.observationMethod && <span className="text-muted-foreground"> · {METHOD_LABEL[h.observationMethod]}</span>}
                            </span>
                            <span className="tabular-nums">
                              {h.observed !== null ? `contado ${qty(h.observed, r.unit)}` : h.quantity !== null ? `${h.quantity > 0 ? '+' : ''}${qty(h.quantity, r.unit)}` : ''}
                              <span className="ml-2 text-xs text-muted-foreground">{new Date(h.occurredAt).toLocaleString('es-AR')}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}

function RowButton({ label, onClick }: { label: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-11 min-w-11 items-center justify-center rounded-xl border border-border px-3 text-sm font-bold hover:bg-muted">
      {label}
    </button>
  )
}
