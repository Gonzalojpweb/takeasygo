'use client'

import { TrendingUp, TrendingDown, Minus, ShoppingBag, DollarSign } from 'lucide-react'
import InfoTooltip from './InfoTooltip'
import type { TrendsData } from '@/lib/tia/metrics'

interface Props {
  data: TrendsData
}

function TrendBadge({ current, previous, label }: { current: number; previous: number; label: string }) {
  const change = previous > 0 ? ((current - previous) / previous) * 100 : 0
  const isUp = change > 5
  const isDown = change < -5
  const isStable = !isUp && !isDown

  return (
    <div className="rounded-xl border border-zinc-100 p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-zinc-500">{label}</span>
        {isUp ? (
          <TrendingUp size={14} className="text-green-500" />
        ) : isDown ? (
          <TrendingDown size={14} className="text-red-500" />
        ) : (
          <Minus size={14} className="text-zinc-400" />
        )}
      </div>
      <p className="text-base font-bold text-zinc-900">{current.toLocaleString()}</p>
      <p className={`text-[11px] mt-0.5 ${isUp ? 'text-green-600' : isDown ? 'text-red-600' : 'text-zinc-400'}`}>
        {change > 0 ? '+' : ''}{change.toFixed(1)}% vs semana anterior
      </p>
    </div>
  )
}

export default function TrendsOverview({ data }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold text-zinc-900">Tendencias</h2>
        <InfoTooltip text="Evolución semanal de métricas clave. Compara los últimos 7 días contra los 7 días anteriores." />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <TrendBadge current={data.orders7d} previous={data.ordersPrev7d} label="Pedidos (7d)" />
        <TrendBadge current={Math.round(data.revenue7d / 1000)} previous={Math.round(data.revenuePrev7d / 1000)} label="Ingresos (7d) en miles $" />
        <TrendBadge current={data.orders30d} previous={data.orders7d * 4} label="Pedidos (30d)" />
      </div>
    </div>
  )
}
