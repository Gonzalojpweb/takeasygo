'use client'

import { TrendingUp, TrendingDown, AlertTriangle, Lightbulb, Minus } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// CustomerInsights.tsx — Secciones de insights del cliente
// ─────────────────────────────────────────────────────────────────────────────
// Patrón: Replica la estructura de InsightCard de TIA.
// Muestra las señales activas y un resumen descriptivo del cliente.
// ─────────────────────────────────────────────────────────────────────────────

interface Insight {
  title: string
  description: string
  type: 'positive' | 'negative' | 'neutral' | 'warning'
}

interface Props {
  signals: string[]
  favoriteCategories?: { category: string; count: number }[]
  favoriteProducts?: { product: string; count: number }[]
  daysSinceLastOrder?: number | null
  avgOrderInterval?: number | null
  trendSummary?: string | null
}

const SIGNAL_LABELS: Record<string, { label: string; type: Insight['type'] }> = {
  highly_frequent: { label: 'Cliente altamente frecuente', type: 'positive' },
  decelerating: { label: 'En desaceleración', type: 'warning' },
  spending_growth: { label: 'Crecimiento de gasto', type: 'positive' },
  frequency_drop: { label: 'Caída de frecuencia', type: 'negative' },
  highly_loyal: { label: 'Altamente leal', type: 'positive' },
  discount_sensitive: { label: 'Sensible a descuentos', type: 'neutral' },
  explorer: { label: 'Explorador de productos', type: 'positive' },
  premium: { label: 'Cliente premium', type: 'positive' },
  high_potential: { label: 'Alto potencial', type: 'positive' },
  dormant: { label: 'Dormido', type: 'negative' },
  at_risk: { label: 'En riesgo', type: 'warning' },
  recovered: { label: 'Recuperado', type: 'positive' },
}

const icons = { positive: TrendingUp, negative: TrendingDown, warning: AlertTriangle, neutral: Lightbulb }
const colors = {
  positive: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  negative: 'text-red-600 bg-red-50 border-red-200',
  warning: 'text-amber-600 bg-amber-50 border-amber-200',
  neutral: 'text-zinc-600 bg-zinc-50 border-zinc-200',
}

export default function CustomerInsights({
  signals, favoriteCategories, favoriteProducts,
  daysSinceLastOrder, avgOrderInterval, trendSummary,
}: Props) {
  const insights: Insight[] = []

  // Generar insights desde señales (P2: comportamiento individual)
  for (const signal of signals) {
    const config = SIGNAL_LABELS[signal]
    if (config) {
      insights.push({ title: config.label, description: '', type: config.type })
    }
  }

  // Insight de tendencia de salud (P4)
  if (trendSummary) {
    const isDeclining = trendSummary.toLowerCase().includes('baj')
    insights.push({
      title: 'Tendencia de salud',
      description: trendSummary,
      type: isDeclining ? 'negative' : 'positive',
    })
  }

  // Insight de dormancy (P2: comparación con intervalo propio)
  if (daysSinceLastOrder !== null && daysSinceLastOrder !== undefined && avgOrderInterval && avgOrderInterval > 0) {
    if (daysSinceLastOrder > avgOrderInterval * 2) {
      insights.push({
        title: 'Anomalía temporal',
        description: `Compraba cada ${Math.round(avgOrderInterval)} días. Lleva ${daysSinceLastOrder} días sin comprar.`,
        type: 'warning',
      })
    }
  }

  // Favoritos
  if (favoriteCategories && favoriteCategories.length > 0) {
    const top = favoriteCategories[0]
    insights.push({
      title: 'Favorito',
      description: `Compra principalmente ${top.category}`,
      type: 'neutral',
    })
  }

  if (insights.length === 0) {
    return (
      <div className="rounded-xl border border-border p-4 bg-card">
        <p className="text-xs text-muted-foreground">Sin insights disponibles todavía</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {insights.map((insight, idx) => {
        const Icon = icons[insight.type]
        return (
          <div key={idx} className={`rounded-xl border p-3 ${colors[insight.type]}`}>
            <div className="flex items-start gap-2">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${colors[insight.type]}`}>
                <Icon size={12} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{insight.title}</p>
                {insight.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{insight.description}</p>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
