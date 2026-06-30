'use client'

import type { Finding } from '@/lib/tia/reporting/types'

interface Props {
  findings: Finding[]
}

const IMPACT_STYLES: Record<string, string> = {
  Alto: 'bg-red-100 text-red-700',
  Medio: 'bg-amber-100 text-amber-700',
  Bajo: 'bg-blue-100 text-blue-700',
}

export default function TopFindings({ findings }: Props) {
  if (findings.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🔥</span>
        <h2 className="text-sm font-semibold text-zinc-900">Lo más importante de hoy</h2>
      </div>

      <div className="space-y-3">
        {findings.map((f, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-zinc-50 border border-zinc-100">
            <span className="text-xl flex-shrink-0 mt-0.5">{f.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-800 leading-relaxed">{f.message}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[11px] font-medium text-indigo-600">→ {f.recommendation}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${IMPACT_STYLES[f.impact] ?? ''}`}>
                  {f.impact}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
