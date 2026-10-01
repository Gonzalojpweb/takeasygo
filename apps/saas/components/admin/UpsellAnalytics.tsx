'use client'

import { TrendingUp, ShoppingBag, Zap, DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { toPesos } from '@takeasygo/business/browser'
import { cn } from '@/lib/utils'

interface UpsellRow {
  name: string
  source: string
  adds: number
  conversions: number
  conversionRate: number
  revenue: number
}

/** Variación vs el período anterior. `null` = sin base comparable. */
export interface UpsellDeltas {
  adds: number | null
  conversions: number | null
  conversionRate: number | null
  revenue: number | null
}

interface Props {
  totalAdds: number
  totalConversions: number
  totalRevenue: number
  overallConversionRate: number
  /** Rango activo del filtro, ej. "últimos 7 días" o "2026-09-01 → 2026-09-30". */
  periodLabel: string
  /** Label del período con el que se compara. */
  prevLabel?: string
  deltas?: UpsellDeltas
  rows: UpsellRow[]
}

const SOURCE_LABELS: Record<string, string> = {
  upsell_sheet: 'Sugerencia',
  checkout_banner: 'Banner',
  best_sellers: 'Catálogo',
}

export default function UpsellAnalytics({
  totalAdds,
  totalConversions,
  totalRevenue,
  overallConversionRate,
  periodLabel,
  prevLabel,
  deltas,
  rows,
}: Props) {
  if (totalAdds === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground text-sm">
        <Zap size={28} className="mx-auto mb-3 opacity-30" />
        <p className="font-semibold">Sin datos de upselling aún</p>
        <p className="mt-1 opacity-60">
          Los datos aparecerán cuando los clientes agreguen productos sugeridos durante {periodLabel}.
        </p>
      </div>
    )
  }

  const hasDeltas = Boolean(
    deltas &&
      (deltas.adds !== null ||
        deltas.conversions !== null ||
        deltas.revenue !== null ||
        deltas.conversionRate !== null)
  )

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<ShoppingBag size={16} />}
          label="Agregados via upsell"
          value={totalAdds.toLocaleString('es-AR')}
          sub={periodLabel}
          delta={deltas?.adds ?? null}
        />
        <KpiCard
          icon={<TrendingUp size={16} />}
          label="Convertidos (pagados)"
          value={totalConversions.toLocaleString('es-AR')}
          sub="órdenes aprobadas"
          delta={deltas?.conversions ?? null}
        />
        <KpiCard
          icon={<Zap size={16} />}
          label="Tasa de conversión"
          value={`${overallConversionRate}%`}
          sub="agregado → pagado"
          highlight={overallConversionRate >= 50}
          delta={deltas?.conversionRate ?? null}
          deltaUnit="pts"
        />
        <KpiCard
          icon={<DollarSign size={16} />}
          label="Revenue upsell"
          value={`$${toPesos(totalRevenue).toLocaleString('es-AR')}`}
          sub="de órdenes aprobadas"
          delta={deltas?.revenue ?? null}
        />
      </div>

      {hasDeltas && prevLabel && (
        <p className="text-[11px] text-muted-foreground -mt-1">Variación contra {prevLabel}</p>
      )}

      {/* Tabla por ítem */}
      {rows.length > 0 && (
        <div className="rounded-2xl border overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Detalle por producto
            </p>
          </div>
          <div className="divide-y">
            {rows.slice(0, 10).map((row, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{row.name}</p>
                  <span className="inline-block text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground mt-0.5">
                    {SOURCE_LABELS[row.source] ?? row.source}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-right flex-shrink-0">
                  <div className="hidden sm:block">
                    <p className="text-xs text-muted-foreground">Agregados</p>
                    <p className="text-sm font-bold">{row.adds}</p>
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-xs text-muted-foreground">Pagados</p>
                    <p className="text-sm font-bold">{row.conversions}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Conversión</p>
                    <p
                      className="text-sm font-bold"
                      style={{ color: row.conversionRate >= 50 ? '#22c55e' : undefined }}
                    >
                      {row.conversionRate}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Revenue</p>
                    <p className="text-sm font-bold">${toPesos(row.revenue).toLocaleString('es-AR')}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  highlight = false,
  delta = null,
  deltaUnit = 'pct',
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  highlight?: boolean
  /** Variación vs el período anterior; `null` no renderiza la pill. */
  delta?: number | null
  deltaUnit?: 'pct' | 'pts'
}) {
  const showDelta = typeof delta === 'number' && Number.isFinite(delta)
  return (
    <div className="rounded-2xl border p-4 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
        {icon}
        {label}
      </div>
      <div className="flex items-start justify-between gap-2">
        <p
          className="text-2xl font-black tracking-tight"
          style={highlight ? { color: '#22c55e' } : undefined}
        >
          {value}
        </p>
        {showDelta && (
          <span
            className={cn(
              'mt-0.5 inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-black tabular-nums',
              delta > 0 && 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
              delta < 0 && 'bg-red-500/10 text-red-600 border-red-500/20',
              delta === 0 && 'bg-muted text-muted-foreground border-border'
            )}
          >
            {delta !== 0 &&
              (delta > 0 ? <ArrowUpRight size={11} strokeWidth={3} /> : <ArrowDownRight size={11} strokeWidth={3} />)}
            {delta > 0 ? '+' : ''}
            {delta}
            {deltaUnit === 'pts' ? ' pts' : '%'}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  )
}
