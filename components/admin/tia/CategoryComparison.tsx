'use client'

import InfoTooltip from './InfoTooltip'
import type { CategoryData } from '@/lib/tia/metrics'

interface Props {
  data: CategoryData[]
}

export default function CategoryComparison({ data }: Props) {
  const maxRevenue = Math.max(...data.map(c => c.revenue), 1)

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold text-zinc-900">Comparativa por producto</h2>
        <InfoTooltip text="Rendimiento de cada producto en los últimos 30 días. La barra muestra el ingreso generado por cada uno." />
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-zinc-400 text-center py-8">Aún no hay suficientes datos</p>
      ) : (
        <div className="space-y-2">
          {data.slice(0, 10).map(item => (
            <div key={item.category}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-zinc-700 font-medium truncate">{item.category}</span>
                <span className="text-zinc-900 font-semibold">${item.revenue.toLocaleString('es-AR')}</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-purple-500"
                  style={{ width: `${(item.revenue / maxRevenue) * 100}%` }}
                />
              </div>
              <div className="flex gap-3 text-[10px] text-zinc-400 mt-0.5">
                <span>{item.totalSold} vendidos</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
