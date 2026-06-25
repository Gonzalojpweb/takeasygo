'use client'

import { Info } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// CustomerHealthScore.tsx — Componente visual del Health Score (P3)
// ─────────────────────────────────────────────────────────────────────────────
// Muestra el score 0-100 con indicador visual de color y tendencia (P4).
// Patrón: Replica la estructura de componentes admin existentes.
// ─────────────────────────────────────────────────────────────────────────────

interface HealthScoreData {
  total: number
  components: Record<string, number>
  calculatedAt: string | null
}

interface Props {
  score: HealthScoreData
  trend?: 'improving' | 'stable' | 'declining' | 'insufficient_data'
  compact?: boolean
}

function getScoreColor(score: number): string {
  if (score >= 75) return 'text-emerald-600 bg-emerald-50 border-emerald-200'
  if (score >= 50) return 'text-amber-600 bg-amber-50 border-amber-200'
  if (score >= 25) return 'text-orange-600 bg-orange-50 border-orange-200'
  return 'text-red-600 bg-red-50 border-red-200'
}

function getScoreLabel(score: number): string {
  if (score >= 75) return 'Excelente'
  if (score >= 50) return 'Bueno'
  if (score >= 25) return 'Regular'
  return 'En riesgo'
}

function getTrendIcon(trend: string): string {
  switch (trend) {
    case 'improving': return '↑'
    case 'declining': return '↓'
    case 'stable': return '→'
    default: return '—'
  }
}

function getTrendColor(trend: string): string {
  switch (trend) {
    case 'improving': return 'text-emerald-500'
    case 'declining': return 'text-red-500'
    case 'stable': return 'text-muted-foreground'
    default: return 'text-muted-foreground/50'
  }
}

const COMPONENT_LABELS: Record<string, string> = {
  frequency: 'Frecuencia',
  recency: 'Recencia',
  ltv: 'Valor',
  engagement: 'Engagement',
  club: 'Club',
  rewards: 'Rewards',
  conversion: 'Conversión',
}

export default function CustomerHealthScore({ score, trend = 'insufficient_data', compact = false }: Props) {
  if (!score || score.total === 0) {
    return (
      <div className="rounded-xl border border-border p-3 bg-card">
        <p className="text-xs text-muted-foreground">Sin datos de salud todavía</p>
      </div>
    )
  }

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-sm font-bold ${getScoreColor(score.total)}`}>
        <span>{score.total}</span>
        <span className="text-[10px] font-medium opacity-70">/ 100</span>
        {trend !== 'insufficient_data' && (
          <span className={`text-xs ${getTrendColor(trend)}`}>{getTrendIcon(trend)}</span>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border p-4 bg-card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Health Score</h3>
        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${getScoreColor(score.total)}`}>
          {score.total} / 100
        </div>
      </div>

      {/* Barra visual */}
      <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            score.total >= 75 ? 'bg-emerald-500' :
            score.total >= 50 ? 'bg-amber-500' :
            score.total >= 25 ? 'bg-orange-500' : 'bg-red-500'
          }`}
          style={{ width: `${score.total}%` }}
        />
      </div>

      {/* Tendencia */}
      {trend !== 'insufficient_data' && (
        <p className={`text-xs font-medium ${getTrendColor(trend)}`}>
          Tendencia: {getTrendIcon(trend)} {trend === 'improving' ? 'Mejorando' : trend === 'declining' ? 'Bajando' : 'Estable'}
        </p>
      )}

      {/* Componentes */}
      {score.components && Object.keys(score.components).length > 0 && (
        <div className="space-y-1.5">
          {Object.entries(score.components).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{COMPONENT_LABELS[key] ?? key}</span>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/60"
                    style={{ width: `${value}%` }}
                  />
                </div>
                <span className="font-semibold tabular-nums w-6 text-right">{Math.round(value)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
