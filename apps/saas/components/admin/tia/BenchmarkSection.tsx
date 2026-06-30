'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react'
import InfoTooltip from './InfoTooltip'
import type { BenchmarkComparison } from '@/lib/tia/reporting/types'

interface ApiProps {
  tenantSlug: string
}

interface ReportProps {
  benchmark: BenchmarkComparison[]
}

type Props = ApiProps | ReportProps

function isReportProps(props: Props): props is ReportProps {
  return 'benchmark' in props
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: 'up' | 'down' | 'neutral'; emoji: string }> = {
  top: { bg: 'bg-green-100', text: 'text-green-700', icon: 'up', emoji: '🟢' },
  above_average: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: 'up', emoji: '🟢' },
  average: { bg: 'bg-zinc-100', text: 'text-zinc-600', icon: 'neutral', emoji: '🟡' },
  below_average: { bg: 'bg-amber-50', text: 'text-amber-600', icon: 'down', emoji: '🔴' },
  bottom: { bg: 'bg-red-50', text: 'text-red-600', icon: 'down', emoji: '🔴' },
}

function formatValue(metric: string, value: number): string {
  if (metric === 'revenue7d') return `$${value.toLocaleString('es-AR')}`
  if (metric === 'avgOrderValue') return `$${value.toLocaleString('es-AR')}`
  if (metric === 'conversionRate') return `${value}%`
  return value.toLocaleString('es-AR')
}

export default function BenchmarkSection(props: Props) {
  // Report mode: receives pre-computed narrative
  if (isReportProps(props)) {
    return <ReportBenchmark benchmark={props.benchmark} />
  }

  // API mode: fetches data itself (legacy, for non-dashboard usage)
  return <ApiBenchmark tenantSlug={props.tenantSlug} />
}

function ReportBenchmark({ benchmark }: { benchmark: BenchmarkComparison[] }) {
  if (benchmark.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-semibold text-zinc-900">Comparación vs. restaurantes similares</h3>
        <InfoTooltip text="Cómo te comparás con otros restaurantes que usan TakeasyGO. Datos anónimos y agregados." />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {benchmark.map(item => {
          const style = STATUS_STYLES[item.status] ?? STATUS_STYLES.average
          return (
            <div key={item.label} className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3.5">
              <span className="text-[11px] font-medium text-zinc-600">{item.label}</span>
              <div className="flex items-center justify-between mt-1">
                <span className="text-lg font-bold text-zinc-900">{item.value}</span>
                <span className="text-lg">{style.emoji}</span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">{item.narrative}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ApiBenchmark({ tenantSlug }: { tenantSlug: string }) {
  const [data, setData] = useState<BenchmarkComparison[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/${tenantSlug}/tia/benchmark`)
      .then(res => res.json())
      .then((json: { benchmarks: { metric: string; label: string; value: number; status: string }[] }) => {
        const mapped: BenchmarkComparison[] = json.benchmarks.map(b => ({
          label: b.label,
          value: formatValue(b.metric, b.value),
          status: b.status as BenchmarkComparison['status'],
          narrative: b.status === 'top' || b.status === 'above_average'
            ? `Estás en una buena posición.`
            : b.status === 'average'
            ? `Estás en el promedio.`
            : `Hay espacio para mejorar.`,
        }))
        setData(mapped)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [tenantSlug])

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-zinc-200 p-5">
        <div className="flex items-center justify-center py-6">
          <Loader2 size={18} className="animate-spin text-zinc-300" />
        </div>
      </div>
    )
  }

  if (!data) return null

  return <ReportBenchmark benchmark={data} />
}
