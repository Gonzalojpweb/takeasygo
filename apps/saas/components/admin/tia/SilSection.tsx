'use client'

import { BrainCircuit } from 'lucide-react'
import InfoTooltip from './InfoTooltip'
import InsightCard from './InsightCard'
import type { Insight } from '@/lib/tia/types'

interface Props {
  data: {
    insights: Insight[]
    anomalies: Insight[]
  }
  loading?: boolean
  tenantSlug?: string
  onDismiss?: (id: string) => void
  onResolve?: (id: string) => void
}

export default function SilSection({ data, loading, tenantSlug, onDismiss, onResolve }: Props) {
  const hasData = data.insights.length > 0 || data.anomalies.length > 0

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <BrainCircuit size={18} className="text-indigo-600 animate-pulse" />
          <h2 className="text-sm font-semibold text-indigo-900">Información detallada</h2>
          <InfoTooltip text="Análisis inteligente de tus datos de los últimos 30 días. Detecta patrones y tendencias que no se ven a simple vista." />
        </div>
        <div className="text-center py-8 text-sm text-indigo-400">
          <BrainCircuit size={32} className="mx-auto mb-2 opacity-50 animate-pulse" />
          <p>Analizando datos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <BrainCircuit size={18} className="text-indigo-600" />
          <h2 className="text-sm font-semibold text-indigo-900">Información detallada</h2>
          <InfoTooltip text="Análisis inteligente de tus datos de los últimos 30 días. Requiere al menos 30 pedidos para ser significativo." />
      </div>

      {!hasData ? (
        <div className="text-center py-8 text-sm text-indigo-400">
          <BrainCircuit size={32} className="mx-auto mb-2 opacity-50" />
          <p>No se encontraron suficientes datos</p>
          <p className="text-xs mt-1">Se necesitan al menos 30 pedidos para generar insights</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.insights.map((insight) => (
            <InsightCard
              key={insight._id}
              _id={insight._id}
              title={insight.title}
              description={insight.description}
              type={insight.severity === 'critical' ? 'warning' : insight.severity === 'info' ? 'neutral' : 'warning'}
              severity={insight.severity}
              dbStatus={insight.dbStatus}
              tenantSlug={tenantSlug}
              onDismiss={onDismiss}
              onResolve={onResolve}
            />
          ))}
          {data.anomalies.map((anomaly) => (
            <InsightCard
              key={anomaly._id}
              _id={anomaly._id}
              title={anomaly.title}
              description={anomaly.description}
              type={anomaly.severity === 'critical' ? 'negative' : 'warning'}
              severity={anomaly.severity}
              dbStatus={anomaly.dbStatus}
              tenantSlug={tenantSlug}
              onDismiss={onDismiss}
              onResolve={onResolve}
            />
          ))}
        </div>
      )}
    </div>
  )
}
