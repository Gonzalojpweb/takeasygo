'use client'

import { Sparkles, BrainCircuit, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import InfoTooltip from './InfoTooltip'
import InsightCard from './InsightCard'
import type { Insight, Recommendation } from '@/lib/tia/types'

interface Props {
  plan: string
  insights: Insight[]
  anomalies: Insight[]
  recommendations: Recommendation[]
}

const SEVERITY_ORDER: Record<string, number> = { critical: 3, warning: 2, info: 1 }

export default function DailyInsightPro({ plan, insights, anomalies, recommendations }: Props) {
  const isPremium = plan === 'full'

  const topInsights = [...insights, ...anomalies]
    .sort((a, b) => (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0))
    .slice(0, 3)

  const topRecommendations = recommendations
    .sort((a, b) => {
      const w = { high: 3, medium: 2, low: 1 }
      return w[b.priority] - w[a.priority]
    })
    .slice(0, 2)

  const severityIcon = (sev: string) => {
    if (sev === 'critical') return <TrendingDown size={14} className="text-red-500" />
    if (sev === 'warning') return <Minus size={14} className="text-amber-500" />
    return <TrendingUp size={14} className="text-emerald-500" />
  }

  const insightCardType = (severity: string): 'positive' | 'negative' | 'neutral' | 'warning' => {
    if (severity === 'critical') return 'negative'
    if (severity === 'warning') return 'warning'
    return 'neutral'
  }

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-indigo-600" />
          <h2 className="text-sm font-semibold text-indigo-900">Informe TIA del día</h2>
          <InfoTooltip text="Panel de inteligencia que analiza todos tus datos y genera hallazgos, patrones y recomendaciones accionables." />
        </div>
        {!isPremium && (
          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-500">
            Premium
          </span>
        )}
      </div>

      {!isPremium ? (
        <div className="text-center py-8">
          <BrainCircuit size={32} className="mx-auto mb-2 text-zinc-300" />
          <p className="text-sm font-semibold text-zinc-500">Actualizá a Premium para acceder al informe completo</p>
          <p className="text-xs text-zinc-400 mt-1">Hallazgos, patrones, anomalías y recomendaciones personalizadas</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Top insights */}
          {topInsights.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider mb-2">
                Principales hallazgos
              </h4>
              <div className="space-y-2">
                {topInsights.map((insight, i) => (
                  <InsightCard
                    key={i}
                    title={insight.title}
                    description={insight.description}
                    type={insightCardType(insight.severity)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Top recommendations */}
          {topRecommendations.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider mb-2">
                Recomendaciones prioritarias
              </h4>
              <div className="space-y-2">
                {topRecommendations.map((rec, i) => (
                  <div key={i} className="bg-white/70 rounded-xl border border-indigo-100 p-3">
                    <div className="flex items-start gap-2">
                      {severityIcon(rec.priority === 'high' ? 'critical' : rec.priority === 'medium' ? 'warning' : 'info')}
                      <div>
                        <p className="text-xs font-semibold text-zinc-800">{rec.title}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">{rec.action}</p>
                        <p className="text-[10px] text-indigo-500 font-medium mt-1">{rec.expectedImpact}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state when no data */}
          {topInsights.length === 0 && topRecommendations.length === 0 && (
            <div className="text-center py-6">
              <BrainCircuit size={28} className="mx-auto mb-2 text-indigo-300" />
              <p className="text-sm text-indigo-400">Sin hallazgos hoy</p>
              <p className="text-xs text-indigo-300 mt-0.5">Los insights se generan automáticamente cada día a las 06:00 UTC</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
