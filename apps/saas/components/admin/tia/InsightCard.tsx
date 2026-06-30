'use client'

import { Lightbulb, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'

interface Props {
  title: string
  description: string
  type: 'positive' | 'negative' | 'neutral' | 'warning'
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

export default function InsightCard({ title, description, type }: Props) {
  const Icon = icons[type]
  const colorClass = colors[type]

  return (
    <div className={`rounded-xl border p-3 ${colorClass}`}>
      <div className="flex items-start gap-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
          <Icon size={14} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900">{title}</p>
          <p className="text-xs text-zinc-600 mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  )
}
