'use client'

import { TrendingUp, ShoppingBag, Zap, DollarSign } from 'lucide-react'

interface UpsellRow {
  name: string
  source: string
  adds: number
  conversions: number
  conversionRate: number
  revenue: number
}

interface Props {
  totalAdds: number
  totalConversions: number
  totalRevenue: number
  overallConversionRate: number
  windowDays: number
  rows: UpsellRow[]
}

const SOURCE_LABELS: Record<string, string> = {
  upsell_sheet: 'Sheet',
  checkout_banner: 'Banner',
}

export default function UpsellAnalytics({
  totalAdds,
  totalConversions,
  totalRevenue,
  overallConversionRate,
  windowDays,
  rows,
}: Props) {
  if (totalAdds === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground text-sm">
        <Zap size={28} className="mx-auto mb-3 opacity-30" />
        <p className="font-semibold">Sin datos de upselling aún</p>
        <p className="mt-1 opacity-60">
          Los datos aparecerán cuando los clientes agreguen productos sugeridos durante los últimos {windowDays} días.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<ShoppingBag size={16} />}
          label="Agregados via upsell"
          value={totalAdds.toLocaleString('es-AR')}
          sub={`últimos ${windowDays} días`}
        />
        <KpiCard
          icon={<TrendingUp size={16} />}
          label="Convertidos (pagados)"
          value={totalConversions.toLocaleString('es-AR')}
          sub="órdenes aprobadas"
        />
        <KpiCard
          icon={<Zap size={16} />}
          label="Tasa de conversión"
          value={`${overallConversionRate}%`}
          sub="agregado → pagado"
          highlight={overallConversionRate >= 50}
        />
        <KpiCard
          icon={<DollarSign size={16} />}
          label="Revenue upsell"
          value={`$${totalRevenue.toLocaleString('es-AR')}`}
          sub="de órdenes aprobadas"
        />
      </div>

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
                    <p className="text-sm font-bold">${row.revenue.toLocaleString('es-AR')}</p>
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
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-2xl border p-4 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
        {icon}
        {label}
      </div>
      <p
        className="text-2xl font-black tracking-tight"
        style={highlight ? { color: '#22c55e' } : undefined}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  )
}
