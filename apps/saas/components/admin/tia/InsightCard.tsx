'use client'

import { useRef, useEffect } from 'react'
import { Lightbulb, TrendingUp, TrendingDown, AlertTriangle, Check, X } from 'lucide-react'
import { captureTiaInsightShown } from '@/lib/events'

interface Props {
  _id?: string
  title: string
  description: string
  type: 'positive' | 'negative' | 'neutral' | 'warning'
  severity?: 'info' | 'warning' | 'critical'
  dbStatus?: 'active' | 'dismissed' | 'resolved'
  tenantSlug?: string
  onDismiss?: (id: string) => void
  onResolve?: (id: string) => void
}

const icons = {
  positive: TrendingUp,
  negative: TrendingDown,
  warning: AlertTriangle,
  neutral: Lightbulb,
}

const colors = {
  positive: 'text-green-600 bg-green-100 border-green-200',
  negative: 'text-red-600 bg-red-100 border-red-200',
  warning: 'text-amber-600 bg-amber-100 border-amber-200',
  neutral: 'text-blue-600 bg-blue-100 border-blue-200',
}

const statusBadge: Record<string, string> = {
  dismissed: 'bg-zinc-100 text-zinc-500',
  resolved: 'bg-green-50 text-green-600',
}

export default function InsightCard({ _id, title, description, type, severity, dbStatus, tenantSlug, onDismiss, onResolve }: Props) {
  const Icon = icons[type]
  const colorClass = colors[dbStatus === 'dismissed' || dbStatus === 'resolved' ? 'neutral' : type]

  // Track shown: write readAt to MongoDB + fire PostHog event (once per insight)
  const shownRef = useRef(false)
  useEffect(() => {
    if (_id && !shownRef.current && typeof window !== 'undefined') {
      shownRef.current = true
      // Write readAt to MongoDB (fire-and-forget)
      if (tenantSlug) {
        fetch(`/api/${tenantSlug}/tia/insights`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ insightId: _id, action: 'read' }),
        }).catch(() => {})
      }
      // Fire PostHog event
      captureTiaInsightShown({
        insightId: _id,
        insightType: type,
        severity: severity || 'info',
      })
    }
  }, [_id, type, severity, tenantSlug])

  const isInteracted = dbStatus === 'dismissed' || dbStatus === 'resolved'

  return (
    <div className={`rounded-xl border p-3 transition-opacity ${colorClass} ${isInteracted ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
          <Icon size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-zinc-900">{title}</p>
            {isInteracted && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusBadge[dbStatus!]}`}>
                {dbStatus === 'dismissed' ? 'Descartado' : 'Resuelto'}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-600 mt-0.5 leading-relaxed">{description}</p>
          {!isInteracted && _id && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => onDismiss?.(_id)}
                className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-600 transition-colors"
              >
                <X size={10} />
                Descartar
              </button>
              <button
                onClick={() => onResolve?.(_id)}
                className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-green-50 hover:bg-green-100 text-green-700 transition-colors"
              >
                <Check size={10} />
                Resuelto
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
