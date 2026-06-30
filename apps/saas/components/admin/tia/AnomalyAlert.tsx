'use client'

import { AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'
import InfoTooltip from './InfoTooltip'

interface Anomaly {
  type: 'positive' | 'negative'
  metric: string
  itemName: string
  currentValue: number
  expectedValue: number
  deviation: number
}

interface Props {
  anomalies: Anomaly[]
}

export default function AnomalyAlert({ anomalies }: Props) {
  if (anomalies.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-zinc-200 p-5">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-sm font-semibold text-zinc-900">Alertas de anomalías</h2>
          <InfoTooltip text="Detección de comportamientos inusuales en tus datos. Sin anomalías detectadas." />
        </div>
        <p className="text-sm text-zinc-400 text-center py-6">Sin anomalías detectadas en los últimos 30 días</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle size={16} className="text-amber-500" />
        <h2 className="text-sm font-semibold text-zinc-900">Alertas de anomalías</h2>
          <InfoTooltip text="Comportamientos inusuales detectados por TIA." />
      </div>

      <div className="space-y-2">
        {anomalies.map((a, i) => (
          <div key={i} className={`rounded-xl border p-3 ${a.type === 'positive' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <div className="flex items-start gap-2">
              {a.type === 'positive' ? (
                <TrendingUp size={16} className="text-green-600 mt-0.5" />
              ) : (
                <TrendingDown size={16} className="text-red-600 mt-0.5" />
              )}
              <div>
                <p className="text-sm font-semibold text-zinc-900">{a.itemName}</p>
                <p className="text-xs text-zinc-600 mt-0.5">
                  {a.metric}: {a.currentValue} vs {a.expectedValue} esperado
                </p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Desviación: {a.deviation > 0 ? '+' : ''}{a.deviation.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
