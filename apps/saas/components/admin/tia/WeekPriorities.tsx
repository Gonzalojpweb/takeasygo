'use client'

import { Target } from 'lucide-react'
import type { WeekPriority } from '@/lib/tia/reporting/types'

interface Props {
  priorities: WeekPriority[]
}

const IMPACT_STYLES: Record<string, string> = {
  Alto: 'bg-red-100 text-red-700',
  Medio: 'bg-amber-100 text-amber-700',
  Bajo: 'bg-blue-100 text-blue-700',
}

const PRIORITY_EMOJIS = ['🎯', '🔄', '📋']

export default function WeekPriorities({ priorities }: Props) {
  if (priorities.length === 0) return null

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Target size={16} className="text-indigo-600" />
        <h2 className="text-sm font-semibold text-indigo-900">Prioridades de esta semana</h2>
      </div>

      <div className="space-y-3">
        {priorities.map((p, i) => (
          <div key={i} className="bg-white/70 rounded-xl border border-indigo-100 p-3.5">
            <div className="flex items-start gap-2">
              <span className="text-lg flex-shrink-0">{PRIORITY_EMOJIS[i] ?? '📋'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-indigo-500 uppercase">Prioridad {i + 1}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${IMPACT_STYLES[p.impact] ?? ''}`}>
                    Impacto: {p.impact}
                  </span>
                </div>
                <p className="text-sm font-semibold text-zinc-900 mt-1">{p.title}</p>
                <p className="text-xs text-zinc-600 mt-0.5">{p.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
