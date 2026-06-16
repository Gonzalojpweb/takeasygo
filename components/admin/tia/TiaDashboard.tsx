'use client'

import { useState, useEffect, useCallback } from 'react'
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
import type { Insight } from '@/lib/tia/types'

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
  const [silData, setSilData] = useState<{ insights: Insight[]; anomalies: Insight[] }>({ insights: [], anomalies: [] })
  const [silLoading, setSilLoading] = useState(false)

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

  const fetchSil = useCallback(async () => {
    setSilLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/tia/sil/analyze`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setSilData({ insights: data.insights ?? [], anomalies: data.anomalies ?? [] })
      }
    } catch (err) {
      console.error('[SIL] fetch error', err)
    } finally {
      setSilLoading(false)
    }
  }, [tenantSlug])

  useEffect(() => {
    fetchMetrics()
  }, [tenantSlug]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loading) fetchSil()
  }, [loading, fetchSil])

  async function handleRefresh() {
    setRefreshing(true)
    await fetchMetrics()
    await fetchSil()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-zinc-400" />
      </div>
    )
  }

  // Quick insights from SIL (growth plan gets 3, premium gets all)
  const maxQuickInsights = isPremium ? silData.insights.length : 3
  const quickInsights = silData.insights.slice(0, maxQuickInsights).map(i => ({
    title: i.title,
    description: i.description,
    type: (i.severity === 'critical' ? 'warning' : i.severity === 'info' ? 'neutral' : 'warning') as 'positive' | 'negative' | 'neutral' | 'warning',
  }))

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

      {/* Quick insights from SIL */}
      {quickInsights.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 mb-3">
            {isPremium ? 'Hallazgos SIL' : 'Hallazgos TIA'}
            <span className="ml-2 text-[10px] font-normal text-zinc-400">({isPremium ? 'ilimitado' : `${quickInsights.length}/3 — upgrade a Premium para más`})</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {quickInsights.map((insight, i) => (
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

      {/* SIL Section (visible for all TIA plans) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SilSection data={silData} loading={silLoading} />
        {isPremium && <CategoryComparison data={metrics.sil.categories} />}
      </div>

      {/* Premium sections */}
      {isPremium && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AnomalyAlert
              anomalies={silData.anomalies.map(a => ({
                type: a.severity === 'critical' ? 'negative' as const : 'positive' as const,
                metric: a.metric,
                itemName: a.title,
                currentValue: a.currentValue,
                expectedValue: a.previousValue ?? 0,
                deviation: a.changePercent ?? 0,
              }))}
            />
            <RecommendationCard
              recommendations={silData.insights
                .filter(i => i.recommendation)
                .map(i => ({
                  title: i.title,
                  description: i.description,
                  action: i.recommendation!,
                  priority: (i.severity === 'critical' ? 'high' : i.severity === 'warning' ? 'medium' : 'low') as 'high' | 'medium' | 'low',
                  category: 'operations' as const,
                }))}
            />
          </div>
        </>
      )}

      {/* Daily Insight Pro */}
      <DailyInsightPro plan={plan} />
    </div>
  )
}
