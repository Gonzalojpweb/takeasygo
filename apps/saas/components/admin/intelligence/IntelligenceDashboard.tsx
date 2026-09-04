'use client'

import { useState, useEffect, useCallback } from 'react'
import { BrainCircuit, Users, TrendingUp, RefreshCw, Loader2 } from 'lucide-react'
import ConversionFunnel from '@/components/admin/tia/ConversionFunnel'
import SegmentDistributionChart from '@/components/admin/cis/charts/SegmentDistributionChart'
import TiaPerformancePanel from './TiaPerformancePanel'

interface Props {
  tenantId: string
  tenantSlug: string
  plan: string
}

interface FunnelData {
  menuOpened: number
  dishViewed: number
  dishAdded: number
  checkoutStarted: number
  orderCompleted: number
}

interface CISMetrics {
  totalCustomers: number
  avgHealthScore: number
  segmentDistribution: Record<string, number>
  atRiskCount: number
  dormantCount: number
  vipCount: number
}

interface TiaEffectiveness {
  totalInsights: number
  readCount: number
  dismissedCount: number
  resolvedCount: number
  readRate: number
  dismissRate: number
  resolveRate: number
}

const SEGMENT_LABELS: Record<string, string> = {
  VIP: 'VIP', LOYAL: 'Leal', FREQUENT: 'Frecuente',
  PROMOTION_HUNTER: 'Promo Hunter', HIGH_POTENTIAL: 'Alto Potencial',
  EXPLORER: 'Explorador', NEW: 'Nuevo', AT_RISK: 'En Riesgo',
  DORMANT: 'Dormido', LOST: 'Perdido',
}

export default function IntelligenceDashboard({ tenantId, tenantSlug, plan }: Props) {
  const [funnelData, setFunnelData] = useState<FunnelData | null>(null)
  const [cisMetrics, setCisMetrics] = useState<CISMetrics | null>(null)
  const [tiaEffectiveness, setTiaEffectiveness] = useState<TiaEffectiveness | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      const [funnelRes, cisRes, tiaRes] = await Promise.allSettled([
        fetch(`/api/${tenantSlug}/funnel`),
        fetch(`/${tenantSlug}/admin/api/crm/metrics`),
        fetch(`/api/${tenantSlug}/tia/effectiveness`),
      ])

      if (funnelRes.status === 'fulfilled' && funnelRes.value.ok) {
        const data = await funnelRes.value.json()
        const f = data.funnel ?? data
        setFunnelData({
          menuOpened: f.menuOpened ?? 0,
          dishViewed: f.dishViewed ?? f.productView ?? 0,
          dishAdded: f.dishAdded ?? f.cartAdd ?? 0,
          checkoutStarted: f.checkoutStarted ?? 0,
          orderCompleted: f.orderCompleted ?? 0,
        })
      }

      if (cisRes.status === 'fulfilled' && cisRes.value.ok) {
        const data = await cisRes.value.json()
        setCisMetrics({
          totalCustomers: data.totalCustomers ?? 0,
          avgHealthScore: data.avgHealthScore ?? 0,
          segmentDistribution: data.segmentDistribution ?? {},
          atRiskCount: data.atRiskCount ?? 0,
          dormantCount: data.dormantCount ?? 0,
          vipCount: data.vipCount ?? 0,
        })
      }

      if (tiaRes.status === 'fulfilled' && tiaRes.value.ok) {
        const data = await tiaRes.value.json()
        setTiaEffectiveness(data)
      }
    } catch (err) {
      console.error('[Intelligence] fetch error', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [tenantSlug])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function handleRefresh() {
    setRefreshing(true)
    await fetchAll()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-zinc-400" />
      </div>
    )
  }

  const segments = cisMetrics
    ? Object.entries(cisMetrics.segmentDistribution)
        .map(([segment, count]) => ({ segment, count: count as number }))
        .filter(s => s.count > 0)
        .sort((a, b) => b.count - a.count)
    : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
            <BrainCircuit size={24} className="text-indigo-600" />
            Intelligence
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Vista unificada de TIA, funil de conversión y clientes
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Section 1: TIA Performance */}
      <TiaPerformancePanel data={tiaEffectiveness} />

      {/* Section 2: Behavioral Funnel + CIS Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {funnelData ? (
            <ConversionFunnel
              data={funnelData}
              bottleneck={
                funnelData.menuOpened > 0 && funnelData.orderCompleted / funnelData.menuOpened < 0.05
                  ? { step: 'Menú → Pedido', dropPercent: 95, narrative: 'La tasa de conversión es menor al 5%. La mayoría de visitantes no convierten.' }
                  : null
              }
            />
          ) : (
            <div className="bg-white rounded-2xl border border-zinc-200 p-6 text-center">
              <TrendingUp size={24} className="mx-auto mb-2 text-zinc-300" />
              <p className="text-sm text-zinc-400">Sin datos de funil disponibles</p>
            </div>
          )}
        </div>

        <div>
          <div className="bg-white rounded-xl border border-zinc-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users size={16} className="text-indigo-500" />
              <h3 className="text-sm font-semibold text-zinc-700">Segmentos</h3>
            </div>
            {segments.length > 0 ? (
              <SegmentDistributionChart
                data={segments.map(s => ({ segment: s.segment, count: s.count }))}
                totalCustomers={cisMetrics?.totalCustomers ?? 0}
              />
            ) : (
              <p className="text-sm text-zinc-400 text-center py-6">Sin datos</p>
            )}
            {cisMetrics && (
              <div className="mt-4 pt-3 border-t border-zinc-100 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-indigo-600">{cisMetrics.totalCustomers}</p>
                  <p className="text-[10px] text-zinc-500">Total</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-green-600">{cisMetrics.vipCount}</p>
                  <p className="text-[10px] text-zinc-500">VIP</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-amber-600">{cisMetrics.atRiskCount}</p>
                  <p className="text-[10px] text-zinc-500">En Riesgo</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
