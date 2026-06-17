'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react'
import InfoTooltip from './InfoTooltip'
import type { BenchmarkItem, BenchmarkStatus } from '@/lib/tia/types'

interface Props {
  isPremium: boolean
  tenantSlug: string
}

const STATUS_STYLES: Record<BenchmarkStatus, { bg: string; text: string; icon: 'up' | 'down' | 'neutral' }> = {
  top: { bg: 'bg-green-100', text: 'text-green-700', icon: 'up' },
  above_average: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: 'up' },
  average: { bg: 'bg-zinc-100', text: 'text-zinc-600', icon: 'neutral' },
  below_average: { bg: 'bg-amber-50', text: 'text-amber-600', icon: 'down' },
  bottom: { bg: 'bg-red-50', text: 'text-red-600', icon: 'down' },
}

function formatValue(metric: string, value: number): string {
  if (metric === 'revenue7d') return `$${value.toLocaleString('es-AR')}`
  if (metric === 'avgOrderValue') return `$${value.toLocaleString('es-AR')}`
  if (metric === 'conversionRate') return `${value}%`
  return value.toLocaleString('es-AR')
}

function formatShortValue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`
  return `$${value}`
}

export default function BenchmarkSection({ isPremium, tenantSlug }: Props) {
  const [data, setData] = useState<BenchmarkItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/${tenantSlug}/tia/benchmark`)
      .then(res => {
        if (!res.ok) throw new Error('Error')
        return res.json()
      })
      .then((json: { benchmarks: BenchmarkItem[] }) => {
        setData(json.benchmarks)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [tenantSlug])

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-zinc-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-sm font-semibold text-zinc-900">Benchmark vs. restaurantes similares</h3>
          <InfoTooltip text="Comparación anónima de tus métricas contra otros restaurantes en TakeasyGO" />
        </div>
        <div className="flex items-center justify-center py-6">
          <Loader2 size={18} className="animate-spin text-zinc-300" />
        </div>
      </div>
    )
  }

  if (error || !data) return null

  if (data.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-semibold text-zinc-900">Benchmark vs. restaurantes similares</h3>
        <InfoTooltip text="Comparación anónima de tus métricas contra otros restaurantes en TakeasyGO. Ningún dato individual de otros restaurantes es revelado." />
        <span className="text-[10px] text-zinc-400 ml-auto">
          {data.length} métricas · {data[0]?.peerCount ?? 0} restaurantes
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.map(item => (
          <BenchmarkCard key={item.metric} item={item} isPremium={isPremium} />
        ))}
      </div>
    </div>
  )
}

function BenchmarkCard({ item, isPremium }: { item: BenchmarkItem; isPremium: boolean }) {
  const style = STATUS_STYLES[item.status]
  const IconComponent = style.icon === 'up' ? TrendingUp : style.icon === 'down' ? TrendingDown : Minus

  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3.5">
      {/* Header with label + tooltip */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[11px] font-medium text-zinc-600">{item.label}</span>
        <InfoTooltip text={item.tooltip} />
      </div>

      {/* Value + badge */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-lg font-bold text-zinc-900">
          {formatValue(item.metric, item.value)}
        </span>
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
          <IconComponent size={10} />
          {item.badge}
        </span>
      </div>

      {/* Percentile bar */}
      {isPremium && (
        <div className="space-y-1.5">
          <div className="relative h-1.5 bg-zinc-200 rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-zinc-800 rounded-full transition-all"
              style={{ width: `${item.percentile}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-zinc-400">
            <span>P25: {formatShortValue(item.p25)}</span>
            <span className="font-medium text-zinc-600">P{item.percentile}</span>
            <span>P75: {formatShortValue(item.p75)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
