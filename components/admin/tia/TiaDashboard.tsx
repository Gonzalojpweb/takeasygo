'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import DailySummary from './DailySummary'
import ConversionFunnel from './ConversionFunnel'
import TopProducts from './TopProducts'
import ClubGrowth from './ClubGrowth'
import TrendsOverview from './TrendsOverview'
import InsightCard from './InsightCard'
import SilSection from './SilSection'
import CategoryComparison from './CategoryComparison'
import HistoricalComparison from './HistoricalComparison'
import AnomalyAlert from './AnomalyAlert'
import RecommendationCard from './RecommendationCard'
import DailyInsightPro from './DailyInsightPro'
import type { TiaMetricsData } from '@/lib/tia/metrics'

interface Props {
  tenantId: string
  tenantSlug: string
  plan: string
  primaryColor: string
}

function getDefaultMetrics(): TiaMetricsData {
  return {
    dailySummary: { todayOrders: 0, todayRevenue: 0, todayNewMembers: 0, todayRewardsRedeemed: 0, pendingOrders: 0, avgOrderValue: 0 },
    conversionFunnel: { menuOpened: 0, dishViewed: 0, dishAdded: 0, checkoutStarted: 0, orderCompleted: 0 },
    topProducts: { mostSold: [], mostViewed: [] },
    clubGrowth: { totalMembers: 0, activeMembers: 0, newMembers7d: 0, newMembers30d: 0, totalPointsIssued: 0, totalPointsRedeemed: 0, redemptions7d: 0 },
    trends: { orders7d: 0, orders30d: 0, ordersPrev7d: 0, revenue7d: 0, revenue30d: 0, revenuePrev7d: 0, conversion7d: 0, conversionPrev7d: 0 },
    historical: { orders: [], revenue: [], members: [] },
    sil: { insights: [], anomalies: [], categories: [] },
  }
}

export default function TiaDashboard({ tenantId, tenantSlug, plan, primaryColor }: Props) {
  const [metrics, setMetrics] = useState<TiaMetricsData>(getDefaultMetrics)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

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

  useEffect(() => {
    fetchMetrics()
  }, [tenantSlug]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRefresh() {
    setRefreshing(true)
    await fetchMetrics()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-zinc-400" />
      </div>
    )
  }

  // Generate rudimentary insights based on available data
  const insights: { title: string; description: string; type: 'positive' | 'negative' | 'neutral' | 'warning' }[] = []

  if (metrics.trends.orders7d > 0 && metrics.trends.ordersPrev7d > 0) {
    const orderChange = ((metrics.trends.orders7d - metrics.trends.ordersPrev7d) / metrics.trends.ordersPrev7d) * 100
    if (orderChange > 10) {
      insights.push({ title: 'Pedidos en aumento', description: `Los pedidos aumentaron ${orderChange.toFixed(0)}% esta semana vs la anterior.`, type: 'positive' })
    } else if (orderChange < -10) {
      insights.push({ title: 'Pedidos en descenso', description: `Los pedidos disminuyeron ${Math.abs(orderChange).toFixed(0)}% esta semana.`, type: 'negative' })
    }
  }

  if (metrics.trends.revenue7d > 0 && metrics.trends.revenuePrev7d > 0) {
    const revenueChange = ((metrics.trends.revenue7d - metrics.trends.revenuePrev7d) / metrics.trends.revenuePrev7d) * 100
    if (Math.abs(revenueChange) > 15) {
      insights.push({
        title: revenueChange > 0 ? 'Ingresos en alza' : 'Ingresos en baja',
        description: `Los ingresos ${revenueChange > 0 ? 'aumentaron' : 'disminuyeron'} ${Math.abs(revenueChange).toFixed(0)}% vs la semana anterior.`,
        type: revenueChange > 0 ? 'positive' : 'negative',
      })
    }
  }

  if (metrics.clubGrowth.newMembers7d > 0 && metrics.clubGrowth.newMembers30d > 0) {
    const memberRate = metrics.clubGrowth.newMembers7d > 0 ? metrics.clubGrowth.newMembers7d : 0
    if (memberRate > 5) {
      insights.push({ title: 'Club en crecimiento', description: `${memberRate} nuevos miembros en los últimos 7 días. El club sigue sumando.`, type: 'positive' })
    }
  }

  if (metrics.dailySummary.avgOrderValue > 0 && metrics.topProducts.mostSold.length > 0) {
    const topItem = metrics.topProducts.mostSold[0]
    insights.push({
      title: `Producto top: ${topItem.name}`,
      description: `${topItem.count} unidades vendidas ($${topItem.revenue.toLocaleString('es-AR')}) en los últimos 30 días.`,
      type: 'neutral',
    })
  }

  if (metrics.dailySummary.todayOrders > 0) {
    insights.push({
      title: 'Resumen del día',
      description: `${metrics.dailySummary.todayOrders} pedidos • $${metrics.dailySummary.todayRevenue.toLocaleString('es-AR')} • ${metrics.dailySummary.todayNewMembers} nuevos miembros`,
      type: 'neutral',
    })
  }

  return (
    <div className="space-y-6">
      {/* Refresh + Plan badge */}
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

      {/* Daily Summary */}
      <DailySummary data={metrics.dailySummary} />

      {/* Insights */}
      {insights.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 mb-3">Hallazgos del día</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {insights.map((insight, i) => (
              <InsightCard key={i} {...insight} />
            ))}
          </div>
        </div>
      )}

      {/* Two column layout: Funnel + Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ConversionFunnel data={metrics.conversionFunnel} />
        </div>
        <div>
          <TrendsOverview data={metrics.trends} />
        </div>
      </div>

      {/* Two column: TopProducts + ClubGrowth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopProducts data={metrics.topProducts} />
        <ClubGrowth data={metrics.clubGrowth} />
      </div>

      {/* Historical (Growth + Premium) */}
      <HistoricalComparison data={metrics.historical} />

      {/* Premium sections */}
      {isPremium && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SilSection data={metrics.sil} />
            <CategoryComparison data={metrics.sil.categories} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AnomalyAlert anomalies={metrics.sil.anomalies} />
            <RecommendationCard recommendations={metrics.sil.insights} />
          </div>
        </>
      )}

      {/* Daily Insight Pro */}
      <DailyInsightPro plan={plan} />
    </div>
  )
}
