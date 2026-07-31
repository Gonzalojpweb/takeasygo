'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, Loader2, Sparkles } from 'lucide-react'
import DailySummary from './DailySummary'
import TopFindings from './TopFindings'
import OpportunitiesSection from './OpportunitiesSection'
import TopProducts from './TopProducts'
import ConversionFunnel from './ConversionFunnel'
import BenchmarkSection from './BenchmarkSection'
import WeekPriorities from './WeekPriorities'
import DailyInsightPro from './DailyInsightPro'
import ClubGrowth from './ClubGrowth'
import TrendsOverview from './TrendsOverview'
import HistoricalComparison from './HistoricalComparison'
import CategoryComparison from './CategoryComparison'
import { generateReport } from '@/lib/tia/reporting/engine'
import type { TiaReport, ReportContext } from '@/lib/tia/reporting/types'
import type { TiaMetricsData } from '@/lib/tia/metrics'
import type { Insight, Recommendation, BenchmarkItem } from '@/lib/tia/types'

interface DbInsight {
  _id: string
  type: Insight['type']
  severity: Insight['severity']
  category: Insight['category']
  title: string
  description: string
  metric: string
  currentValue: number
  previousValue?: number
  changePercent?: number
  sampleSize: number
  recommendation?: string
  generatedAt: string
}

interface Props {
  tenantId: string
  tenantSlug: string
  plan: string
  primaryColor: string
}

function getDefaultMetrics(): TiaMetricsData {
  return {
    dailySummary: { todayOrders: 0, todayRevenue: 0, todayNewMembers: 0, todayRewardsRedeemed: 0, pendingOrders: 0, avgOrderValue: 0, todayTakeawayOrders: 0, todayDeliveryOrders: 0 },
    conversionFunnel: { menuOpened: 0, dishViewed: 0, dishAdded: 0, checkoutStarted: 0, orderCompleted: 0 },
    topProducts: { mostSold: [], mostViewed: [] },
    clubGrowth: { totalMembers: 0, activeMembers: 0, newMembers7d: 0, newMembers30d: 0, totalPointsIssued: 0, totalPointsRedeemed: 0, redemptions7d: 0 },
    trends: { orders7d: 0, orders30d: 0, ordersPrev7d: 0, revenue7d: 0, revenue30d: 0, revenuePrev7d: 0, conversion7d: 0, conversionPrev7d: 0 },
    historical: { orders: [], revenue: [], members: [] },
    sil: { insights: [], anomalies: [], categories: [] },
  }
}

function mapDbInsight(i: DbInsight): Insight {
  return {
    type: i.type,
    severity: i.severity,
    category: i.category,
    title: i.title,
    description: i.description,
    metric: i.metric,
    currentValue: i.currentValue,
    previousValue: i.previousValue,
    changePercent: i.changePercent,
    sampleSize: i.sampleSize,
    recommendation: i.recommendation,
  }
}

export default function TiaDashboard({ tenantId, tenantSlug, plan, primaryColor }: Props) {
  const [metrics, setMetrics] = useState<TiaMetricsData>(getDefaultMetrics)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [silData, setSilData] = useState<{ insights: Insight[]; anomalies: Insight[] }>({ insights: [], anomalies: [] })
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [silLoading, setSilLoading] = useState(false)
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkItem[]>([])

  const isPremium = plan === 'full'

  async function fetchMetrics() {
    try {
      const res = await fetch(`/api/${tenantSlug}/tia/metrics`)
      if (!res.ok) throw new Error('Error fetching metrics')
      const data = await res.json()
      setMetrics(data)
      setError(null)
    } catch (err) {
      setError('Error al cargar métricas')
      console.error(err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const fetchDailyInsights = useCallback(async () => {
    setSilLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/tia/insights`)
      if (res.ok) {
        const data = await res.json()
        const all = (data.insights ?? []) as DbInsight[]
        setSilData({
          insights: all.filter((i: DbInsight) => i.type !== 'anomaly').map(mapDbInsight),
          anomalies: all.filter((i: DbInsight) => i.type === 'anomaly').map(mapDbInsight),
        })
        setRecommendations(data.recommendations ?? [])
      }
    } catch (err) {
      console.error('[TIA Insights] fetch error', err)
    } finally {
      setSilLoading(false)
    }
  }, [tenantSlug])

  const fetchBenchmark = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/tia/benchmark`)
      if (res.ok) {
        const json = await res.json()
        setBenchmarkData(json.benchmarks ?? [])
      }
    } catch {
      // Silently fail — benchmark is non-critical
    }
  }, [tenantSlug])

  const runSilNow = useCallback(async () => {
    setSilLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/tia/sil/analyze`, { method: 'POST' })
      if (res.ok) {
        setRecommendations([])
        setSilData({ insights: [], anomalies: [] })
        await fetchDailyInsights()
      }
    } catch (err) {
      console.error('[SIL] fetch error', err)
    } finally {
      setSilLoading(false)
    }
  }, [tenantSlug, fetchDailyInsights])

  useEffect(() => {
    fetchMetrics()
  }, [tenantSlug])

  useEffect(() => {
    if (!loading) {
      fetchDailyInsights()
      fetchBenchmark()
    }
  }, [loading, fetchDailyInsights, fetchBenchmark])

  async function handleRefresh() {
    setRefreshing(true)
    await fetchMetrics()
    await fetchDailyInsights()
    await fetchBenchmark()
  }

  const reportContext: ReportContext = useMemo(() => ({
    metrics,
    insights: silData.insights,
    anomalies: silData.anomalies,
    recommendations,
    benchmark: benchmarkData,
  }), [metrics, silData, recommendations, benchmarkData])

  const report: TiaReport = useMemo(() => generateReport(reportContext), [reportContext])

  const hasInsights = silData.insights.length > 0 || silData.anomalies.length > 0

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-zinc-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
            isPremium ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'
          }`}>
            {isPremium ? 'Premium' : 'Growth'}
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      {/* SECCIÓN 0: Resumen del día */}
      <DailySummary data={metrics.dailySummary} />

      {/* SECCIÓN 1: Lo más importante de hoy */}
      <TopFindings findings={report.findings} />

      {/* SECCIÓN 2: Oportunidades detectadas */}
      <OpportunitiesSection opportunities={report.opportunities} />

      {/* SECCIÓN 3: Productos */}
      <TopProducts data={metrics.topProducts} report={report.products} narrative={report.productNarrative} />

      {/* SECCIÓN 4: Conversión */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ConversionFunnel data={metrics.conversionFunnel} bottleneck={report.conversion.bottleneck} />
        </div>
        <div>
          <TrendsOverview data={metrics.trends} />
        </div>
      </div>

      {/* SECCIÓN 5: Comparación vs restaurantes similares */}
      <BenchmarkSection benchmark={report.benchmark} />

      {/* SECCIÓN extra: Club + Histórico */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ClubGrowth data={metrics.clubGrowth} />
        <HistoricalComparison data={metrics.historical} />
      </div>

      {/* SECCIÓN 6: Prioridades de esta semana */}
      <WeekPriorities priorities={report.priorities} />

      {/* SECCIÓN extra: SIL raw insights for debug/fallback */}
      {!silLoading && hasInsights && (
        <details className="bg-zinc-50 rounded-2xl border border-zinc-200 p-4">
          <summary className="text-xs font-semibold text-zinc-500 cursor-pointer hover:text-zinc-700">
            Ver análisis SIL detallado ({silData.insights.length + silData.anomalies.length} hallazgos)
          </summary>
          <div className="mt-3 space-y-2">
            {silData.insights.slice(0, 5).map((insight, i) => (
              <div key={i} className="text-xs text-zinc-600 p-2 bg-white rounded-lg border border-zinc-100">
                <span className="font-semibold">{insight.title}</span>
                <span className="text-zinc-400 ml-2">{insight.description}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* SIL generate button */}
      {!silLoading && !hasInsights && (
        <div className="bg-zinc-50 rounded-2xl border border-zinc-200 p-5 text-center">
          <Sparkles size={24} className="mx-auto mb-2 text-zinc-300" />
          <p className="text-sm text-zinc-500">Los insights del día se generan automáticamente a las 06:00 UTC</p>
          <button
            onClick={runSilNow}
            disabled={silLoading}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors disabled:opacity-50"
          >
            {silLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            Generar ahora
          </button>
        </div>
      )}

      {/* SECCIÓN 7: Resumen diario */}
      <DailyInsightPro plan={plan} whatsapp={report.whatsapp} />
    </div>
  )
}
