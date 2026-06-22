'use client'

import { Lightbulb } from 'lucide-react'
import type { Opportunity } from '@/lib/tia/reporting/types'

interface Props {
  opportunities: Opportunity[]
}

const IMPACT_STYLES: Record<string, string> = {
  Alto: 'bg-red-100 text-red-700',
  Medio: 'bg-amber-100 text-amber-700',
  Bajo: 'bg-blue-100 text-blue-700',
}

export default function OpportunitiesSection({ opportunities }: Props) {
  if (opportunities.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb size={16} className="text-amber-500" />
        <h2 className="text-sm font-semibold text-zinc-900">Oportunidades detectadas</h2>
      </div>

      <div className="space-y-3">
        {opportunities.map((opp, i) => (
          <div key={i} className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
            <div className="flex items-start gap-2">
              <span className="text-lg flex-shrink-0">💡</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900">{opp.headline}</p>
                <p className="text-xs text-zinc-600 mt-1">{opp.explanation}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] font-medium text-indigo-600">→ {opp.recommendation}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${IMPACT_STYLES[opp.impact] ?? ''}`}>
                    Impacto: {opp.impact}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
