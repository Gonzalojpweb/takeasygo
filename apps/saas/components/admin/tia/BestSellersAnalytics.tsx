'use client'

import { Eye, MousePointerClick, ShoppingCart, TrendingUp } from 'lucide-react'
import { toPesos } from '@takeasygo/business'
import type { BestSellersAnalyticsData } from '@/lib/tia/metrics'

interface Props {
  data: BestSellersAnalyticsData
}

export default function BestSellersAnalytics({ data }: Props) {
  const hasData = data.viewed > 0 || data.clicked > 0 || data.added > 0

  if (!hasData) {
    return (
      <div className="rounded-2xl border border-dashed p-6 text-center text-muted-foreground text-sm">
        <Eye size={24} className="mx-auto mb-2 opacity-30" />
        <p className="font-semibold">Sin datos del catálogo aún</p>
        <p className="mt-1 opacity-60">
          Los datos aparecerán cuando los clientes interactúen con la sección de más vendidos.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border/40 bg-muted/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
            <TrendingUp size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight">Catálogo de más vendidos</h3>
            <p className="text-[11px] text-muted-foreground">Upselling inteligente · últimos 30 días</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Funnel visual */}
        <div className="flex items-center gap-2 text-xs">
          <FunnelStep
            icon={<Eye size={12} />}
            label="Vieron"
            value={data.viewed}
            rate={null}
          />
          <Chevron />
          <FunnelStep
            icon={<MousePointerClick size={12} />}
            label="Clickearon"
            value={data.clicked}
            rate={data.viewToClickRate}
          />
          <Chevron />
          <FunnelStep
            icon={<ShoppingCart size={12} />}
            label="Agregaron"
            value={data.added}
            rate={data.clickToAddRate}
          />
          <Chevron />
          <FunnelStep
            icon={<TrendingUp size={12} />}
            label="Compraron"
            value={data.ordered}
            rate={data.addConversionRate}
          />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-muted/30 p-3">
            <p className="text-[11px] text-muted-foreground font-medium">Conversión general</p>
            <p className="text-xl font-black tracking-tight" style={{ color: data.viewToClickRate >= 30 ? '#22c55e' : undefined }}>
              {data.viewToClickRate}%
            </p>
            <p className="text-[10px] text-muted-foreground">vista → clic</p>
          </div>
          <div className="rounded-xl bg-muted/30 p-3">
            <p className="text-[11px] text-muted-foreground font-medium">Revenue generado</p>
            <p className="text-xl font-black tracking-tight">
              ${toPesos(data.revenue).toLocaleString('es-AR')}
            </p>
            <p className="text-[10px] text-muted-foreground">de items del catálogo</p>
          </div>
        </div>

        {/* Descripción */}
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          El carrusel de más vendidos muestra los productos populares y funciona como upselling automático.
          Los clientes agregan items desde el catálogo que se reflejan en tus ventas.
        </p>
      </div>
    </div>
  )
}

function FunnelStep({ icon, label, value, rate }: { icon: React.ReactNode; label: string; value: number; rate: number | null }) {
  return (
    <div className="flex-1 text-center">
      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-sm font-bold">{value.toLocaleString('es-AR')}</p>
      {rate !== null && (
        <p className="text-[10px] text-muted-foreground">{rate}%</p>
      )}
    </div>
  )
}

function Chevron() {
  return <span className="text-muted-foreground/40 text-xs">→</span>
}
