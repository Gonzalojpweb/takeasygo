'use client'

import { TrendingUp, Star } from 'lucide-react'
import InfoTooltip from './InfoTooltip'
import type { TopProductsData } from '@/lib/tia/metrics'
import type { ProductReport } from '@/lib/tia/reporting/types'

interface Props {
  data: TopProductsData
  report?: ProductReport[]
  narrative?: string
}

const LABEL_STYLES: Record<string, string> = {
  estrella: 'text-amber-600 bg-amber-100',
  bueno: 'text-green-600 bg-green-100',
}

const LABEL_TEXT: Record<string, string> = {
  estrella: '⭐⭐ Estrella',
  bueno: '⭐ Bueno',
}

export default function TopProducts({ data, report, narrative }: Props) {
  const items = report ?? data.mostSold.slice(0, 5).map((p, _i, arr) => {
    const total = arr.reduce((s, x) => s + x.count, 0)
    const share = total > 0 ? Math.round((p.count / total) * 100) : 0
    return {
      name: p.name,
      sales: p.count,
      share,
      label: share >= 35 ? 'estrella' as const : share >= 20 ? 'bueno' as const : 'normal' as const,
      revenue: p.revenue,
    }
  })

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold text-zinc-900">Productos</h2>
        <InfoTooltip text="Los productos más vendidos en los últimos 30 días, con su participación sobre el total." />
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-zinc-400 text-center py-8">Aún no hay suficientes datos</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={item.name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-50 transition-colors">
              <span className="w-5 text-center text-xs font-bold text-zinc-400">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-zinc-900 truncate">{item.name}</p>
                  {item.label !== 'normal' && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${LABEL_STYLES[item.label] ?? ''}`}>
                      {LABEL_TEXT[item.label]}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-zinc-500 mt-0.5">
                  <span className="flex items-center gap-1"><TrendingUp size={11} /> {item.sales} vendidos</span>
                  <span className="font-semibold text-zinc-700">{item.share}%</span>
                  <span>${item.revenue.toLocaleString('es-AR')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {narrative && (
        <p className="text-xs text-zinc-500 mt-3 pt-3 border-t border-zinc-100 italic">{narrative}</p>
      )}
    </div>
  )
}
