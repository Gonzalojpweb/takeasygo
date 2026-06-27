'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

// ─────────────────────────────────────────────────────────────────────────────
// HealthScoreTrendChart — Evolución del Health Score en el tiempo
// ─────────────────────────────────────────────────────────────────────────────
// Patrón: Usa recharts LineChart. Labels en español, tooltips descriptivos.
// Lenguaje humano: el texto debajo del gráfico explica qué significa la tendencia.
// ─────────────────────────────────────────────────────────────────────────────

interface HistoryEntry {
  date: string
  total: number
}

interface Props {
  data: HistoryEntry[]
  trend?: 'improving' | 'stable' | 'declining' | 'insufficient_data'
  compact?: boolean
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`
}

function formatFullDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} de ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
}

function getScoreLabel(score: number): string {
  if (score >= 75) return 'Excelente'
  if (score >= 50) return 'Bueno'
  if (score >= 25) return 'Regular'
  return 'En riesgo'
}

function getScoreColor(score: number): string {
  if (score >= 75) return '#10b981'
  if (score >= 50) return '#f59e0b'
  if (score >= 25) return '#f97316'
  return '#ef4444'
}

function getTrendText(trend: string): string {
  switch (trend) {
    case 'improving': return 'La salud del cliente está mejorando.'
    case 'declining': return 'La salud del cliente está bajando. Considerá contactarlo.'
    case 'stable': return 'La salud del cliente se mantiene estable.'
    default: return 'No hay suficientes datos para mostrar la tendencia.'
  }
}

function getTrendColor(trend: string): string {
  switch (trend) {
    case 'improving': return 'text-emerald-600'
    case 'declining': return 'text-red-600'
    case 'stable': return 'text-muted-foreground'
    default: return 'text-muted-foreground/50'
  }
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const entry = payload[0].payload
  return (
    <div className="bg-white rounded-xl border border-border p-3 shadow-lg text-xs">
      <p className="font-bold text-foreground">{formatFullDate(entry.date)}</p>
      <p className="mt-1">
        Health Score: <span className="font-bold" style={{ color: getScoreColor(entry.total) }}>{entry.total}</span>
        <span className="text-muted-foreground ml-1">({getScoreLabel(entry.total)})</span>
      </p>
    </div>
  )
}

export default function HealthScoreTrendChart({ data, trend = 'insufficient_data', compact = false }: Props) {
  if (!data || data.length < 2) {
    return (
      <div className="rounded-xl border border-border p-4 bg-card">
        <p className="text-xs text-muted-foreground">Se necesitan al menos 2 meses de datos para mostrar la evolución.</p>
      </div>
    )
  }

  const chartData = data.map(d => ({
    ...d,
    date: formatDate(d.date),
    fullDate: d.date,
  }))

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <Line
                type="monotone"
                dataKey="total"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#6366f1' }}
              />
              <Tooltip content={<CustomTooltip />} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border p-4 bg-card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Evolución de Salud</h3>
        {trend !== 'insufficient_data' && (
          <span className={`text-xs font-medium ${getTrendColor(trend)}`}>
            {trend === 'improving' ? '↑ Mejorando' : trend === 'declining' ? '↓ Bajando' : '→ Estable'}
          </span>
        )}
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={75} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.4} />
            <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.4} />
            <ReferenceLine y={25} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.4} />
            <Line
              type="monotone"
              dataKey="total"
              stroke="#6366f1"
              strokeWidth={2.5}
              dot={{ r: 3, fill: '#6366f1' }}
              activeDot={{ r: 5, fill: '#6366f1' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Texto descriptivo en lenguaje humano */}
      <p className={`text-xs leading-relaxed ${getTrendColor(trend)}`}>
        {getTrendText(trend)}
      </p>

      {/* Leyenda de colores */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> 75-100 Excelente
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> 50-74 Bueno
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-orange-500" /> 25-49 Regular
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" /> 0-24 En riesgo
        </span>
      </div>
    </div>
  )
}
