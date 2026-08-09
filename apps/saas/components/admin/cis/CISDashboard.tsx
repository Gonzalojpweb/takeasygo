'use client'

import { useState, useEffect } from 'react'
import { Users, Heart, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react'
import { toPesos } from '@takeasygo/business'
import SegmentDistributionChart from './charts/SegmentDistributionChart'
import LTVDashboard from './LTVDashboard'

interface Props {
  tenantId: string
  tenantSlug: string
  plan: string
}

interface Metrics {
  totalCustomers: number
  avgHealthScore: number
  segmentDistribution: Record<string, number>
  atRiskCount: number
  dormantCount: number
  vipCount: number
  avgTicket: number
  avgVisitFrequency: number
  totalRevenue: number
}

const SEGMENT_LABELS: Record<string, string> = {
  VIP: 'VIP',
  LOYAL: 'Leal',
  FREQUENT: 'Frecuente',
  PROMOTION_HUNTER: 'Promo Hunter',
  HIGH_POTENTIAL: 'Alto Potencial',
  EXPLORER: 'Explorador',
  NEW: 'Nuevo',
  AT_RISK: 'En Riesgo',
  DORMANT: 'Dormido',
  LOST: 'Perdido',
}

export default function CISDashboard({ tenantId, tenantSlug, plan }: Props) {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'ltv'>('overview')

  const fetchMetrics = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/${tenantSlug}/admin/api/crm/metrics`)
      if (res.ok) {
        const data = await res.json()
        setMetrics(data)
      }
    } catch (e) {
      console.error('Error fetching CIS metrics:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
  }, [tenantSlug])

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
        <span className="ml-2 text-zinc-500">Cargando datos de inteligencia...</span>
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-500">No hay datos de inteligencia disponibles.</p>
        <p className="text-sm text-zinc-400 mt-1">El procesamiento diario se ejecuta a las 4:00 AM.</p>
      </div>
    )
  }

  const segments = Object.entries(metrics.segmentDistribution || {})
    .map(([segment, count]) => ({ segment, count: count as number }))
    .filter(s => s.count > 0)
    .sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Inteligencia de Clientes</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Perfiles, segmentos, Health Score y LTV de tus clientes
          </p>
        </div>
        <button
          onClick={fetchMetrics}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      <div className="flex gap-1 border-b border-zinc-200">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-rose-500 text-rose-600'
              : 'border-transparent text-zinc-500 hover:text-zinc-700'
          }`}
        >
          Resumen
        </button>
        <button
          onClick={() => setActiveTab('ltv')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'ltv'
              ? 'border-rose-500 text-rose-600'
              : 'border-transparent text-zinc-500 hover:text-zinc-700'
          }`}
        >
          LTV Dashboard
        </button>
      </div>

      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={Users}
              label="Total Clientes"
              value={metrics.totalCustomers.toLocaleString('es-AR')}
              color="text-blue-600"
              bg="bg-blue-50"
            />
            <StatCard
              icon={Heart}
              label="Salud Promedio"
              value={`${metrics.avgHealthScore}`}
              suffix="/100"
              color="text-rose-600"
              bg="bg-rose-50"
            />
            <StatCard
              icon={AlertTriangle}
              label="En Riesgo"
              value={metrics.atRiskCount.toString()}
              color="text-amber-600"
              bg="bg-amber-50"
            />
            <StatCard
              icon={TrendingUp}
              label="Dormidos"
              value={metrics.dormantCount.toString()}
              color="text-zinc-600"
              bg="bg-zinc-100"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-zinc-200 p-6">
              <h3 className="text-sm font-semibold text-zinc-700 mb-4">Distribución de Segmentos</h3>
              {segments.length > 0 ? (
                <SegmentDistributionChart
                  data={segments.map(s => ({
                    segment: s.segment,
                    count: s.count,
                  }))}
                  totalCustomers={metrics.totalCustomers}
                />
              ) : (
                <p className="text-sm text-zinc-400 text-center py-8">Sin datos de segmentos</p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-zinc-200 p-6">
              <h3 className="text-sm font-semibold text-zinc-700 mb-4">Segmentos Principales</h3>
              <div className="space-y-3">
                {segments.slice(0, 6).map(({ segment, count }) => (
                  <div key={segment} className="flex items-center justify-between">
                    <span className="text-sm text-zinc-600">
                      {SEGMENT_LABELS[segment] ?? segment}
                    </span>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-2 bg-zinc-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-rose-500 rounded-full"
                          style={{
                            width: `${metrics.totalCustomers > 0 ? (count / metrics.totalCustomers) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium text-zinc-900 w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-zinc-200 p-6">
            <h3 className="text-sm font-semibold text-zinc-700 mb-4">Resumen de Actividad</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-2xl font-bold text-zinc-900">
                  ${toPesos(metrics.avgTicket).toLocaleString('es-AR')}
                </p>
                <p className="text-xs text-zinc-500 mt-1">Ticket Promedio</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-900">
                  {metrics.avgVisitFrequency.toFixed(1)}
                </p>
                <p className="text-xs text-zinc-500 mt-1">Visitas/Mes</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-900">
                  {metrics.vipCount}
                </p>
                <p className="text-xs text-zinc-500 mt-1">Clientes VIP</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-900">
                  ${(metrics.totalRevenue / 1_000_000).toFixed(1)}M
                </p>
                <p className="text-xs text-zinc-500 mt-1">Ingreso Total</p>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'ltv' && (
        <LTVDashboard tenantSlug={tenantSlug} />
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  color,
  bg,
}: {
  icon: React.ElementType
  label: string
  value: string
  suffix?: string
  color: string
  bg: string
}) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${bg}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <div>
          <p className="text-2xl font-bold text-zinc-900">
            {value}
            {suffix && <span className="text-sm font-normal text-zinc-400">{suffix}</span>}
          </p>
          <p className="text-xs text-zinc-500">{label}</p>
        </div>
      </div>
    </div>
  )
}
