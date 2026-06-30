'use client'

import { useState } from 'react'
import InfoTooltip from './InfoTooltip'
import type { HistoricalData } from '@/lib/tia/metrics'

interface Props {
  data: HistoricalData
}

type Series = 'orders' | 'revenue' | 'members'

export default function HistoricalComparison({ data }: Props) {
  const [series, setSeries] = useState<Series>('orders')

  const seriesMap: Record<Series, { label: string; data: { label: string; value: number }[]; color: string }> = {
    orders: { label: 'Pedidos', data: data.orders, color: '#3b82f6' },
    revenue: { label: 'Ingresos', data: data.revenue, color: '#22c55e' },
    members: { label: 'Miembros', data: data.members, color: '#f59e0b' },
  }

  const currentSeries = seriesMap[series]
  const maxValue = Math.max(...currentSeries.data.map(d => d.value), 1)

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">Histórico 30 días</h2>
          <InfoTooltip text="Evolución diaria de los últimos 30 días. Seleccioná la métrica que querés visualizar." />
        </div>
        <div className="flex gap-1">
          {(Object.keys(seriesMap) as Series[]).map(key => (
            <button
              key={key}
              onClick={() => setSeries(key)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                series === key ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {seriesMap[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-40 flex items-end gap-0.5">
        {currentSeries.data.map((d, i) => (
          <div
            key={i}
            className="flex-1 rounded-t relative group"
            style={{
              height: `${(d.value / maxValue) * 100}%`,
              backgroundColor: currentSeries.color,
              minHeight: d.value > 0 ? '4px' : '0',
              opacity: 0.7 + (d.value / maxValue) * 0.3,
            }}
          >
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              {d.value} ({d.label})
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
