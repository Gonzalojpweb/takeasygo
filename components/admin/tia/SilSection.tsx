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
}

export default function SilSection({ data, loading }: Props) {
  const hasData = data.insights.length > 0 || data.anomalies.length > 0

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <BrainCircuit size={18} className="text-indigo-600 animate-pulse" />
          <h2 className="text-sm font-semibold text-indigo-900">Capa de Inteligencia Estadística (SIL)</h2>
          <InfoTooltip text="SIL analiza tus datos con métodos estadísticos para detectar patrones, tendencias y anomalías que no se ven a simple vista." />
        </div>
        <div className="text-center py-8 text-sm text-indigo-400">
          <BrainCircuit size={32} className="mx-auto mb-2 opacity-50 animate-pulse" />
          <p>Ejecutando análisis SIL...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <BrainCircuit size={18} className="text-indigo-600" />
        <h2 className="text-sm font-semibold text-indigo-900">Capa de Inteligencia Estadística (SIL)</h2>
        <InfoTooltip text="SIL analiza tus datos con métodos estadísticos para detectar patrones, tendencias y anomalías. Requiere al menos 30 muestras para ser significativo." />
      </div>

      {!hasData ? (
        <div className="text-center py-8 text-sm text-indigo-400">
          <BrainCircuit size={32} className="mx-auto mb-2 opacity-50" />
          <p>SIL no encontró suficientes datos</p>
          <p className="text-xs mt-1">Se necesitan al menos 30 pedidos para generar inteligencia estadística</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.insights.map((insight, i) => (
            <InsightCard
              key={i}
              title={insight.title}
              description={insight.description}
              type={insight.severity === 'critical' ? 'warning' : insight.severity === 'info' ? 'neutral' : 'warning'}
            />
          ))}
          {data.anomalies.map((anomaly, i) => (
            <InsightCard
              key={`anomaly-${i}`}
              title={anomaly.title}
              description={anomaly.description}
              type={anomaly.severity === 'critical' ? 'negative' : 'warning'}
            />
          ))}
        </div>
      )}
    </div>
  )
}
