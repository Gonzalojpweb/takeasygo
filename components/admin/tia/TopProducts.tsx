'use client'

import { TrendingUp, Eye } from 'lucide-react'
import InfoTooltip from './InfoTooltip'
import type { TopProductsData } from '@/lib/tia/metrics'

interface Props {
  data: TopProductsData
}

export default function TopProducts({ data }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold text-zinc-900">Productos más vendidos</h2>
        <InfoTooltip text="Los 10 productos con más unidades vendidas en los últimos 30 días. Ordenados por cantidad de ventas." />
      </div>

      {data.mostSold.length === 0 ? (
        <p className="text-sm text-zinc-400 text-center py-8">Aún no hay suficientes datos</p>
      ) : (
        <div className="space-y-2">
          {data.mostSold.slice(0, 5).map((item, i) => (
            <div key={item.name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-50 transition-colors">
              <span className="w-5 text-center text-xs font-bold text-zinc-400">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900 truncate">{item.name}</p>
                <div className="flex items-center gap-3 text-[11px] text-zinc-500 mt-0.5">
                  <span className="flex items-center gap-1"><TrendingUp size={11} /> {item.count} vendidos</span>
                  <span>${item.revenue.toLocaleString('es-AR')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
