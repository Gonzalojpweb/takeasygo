'use client'

import { BrainCircuit } from 'lucide-react'
import InfoTooltip from './InfoTooltip'
import InsightCard from './InsightCard'
import type { SilData } from '@/lib/tia/metrics'

interface Props {
  data: SilData
}

export default function SilSection({ data }: Props) {
  const hasData = data.insights.length > 0 || data.anomalies.length > 0

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <BrainCircuit size={18} className="text-indigo-600" />
        <h2 className="text-sm font-semibold text-indigo-900">Capa de Inteligencia Estadística (SIL)</h2>
        <InfoTooltip text="SIL analiza tus datos con métodos estadísticos para detectar patrones, tendencias y anomalías que no se ven a simple vista. Requiere al menos 30 muestras para ser significativo." />
      </div>

      {!hasData ? (
        <div className="text-center py-8 text-sm text-indigo-400">
          <BrainCircuit size={32} className="mx-auto mb-2 opacity-50" />
          <p>SIL está analizando tus datos</p>
          <p className="text-xs mt-1">Se necesitan al menos 30 pedidos para generar inteligencia estadística</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.insights.map((insight, i) => (
            <InsightCard
              key={i}
              title={insight.title}
              description={insight.description}
              type={insight.priority === 'high' ? 'warning' : 'neutral'}
            />
          ))}
          {data.anomalies.map((anomaly, i) => (
            <InsightCard
              key={`anomaly-${i}`}
              title={anomaly.metric}
              description={`${anomaly.itemName}: ${anomaly.currentValue} vs ${anomaly.expectedValue} esperado (${anomaly.deviation > 0 ? '+' : ''}${anomaly.deviation.toFixed(1)}%)`}
              type={anomaly.type === 'positive' ? 'positive' : 'negative'}
            />
          ))}
        </div>
      )}
    </div>
  )
}
