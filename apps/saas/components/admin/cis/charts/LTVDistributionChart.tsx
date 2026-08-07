'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { toPesos } from '@takeasygo/business'

// ─────────────────────────────────────────────────────────────────────────────
// LTVDistributionChart — Distribución de LTV por segmento
// ─────────────────────────────────────────────────────────────────────────────
// Patrón: Usa recharts BarChart. Labels en español.
// Lenguaje humano: el eje Y muestra "$" y el texto describe el valor.
// ─────────────────────────────────────────────────────────────────────────────

interface LTVData {
  segment: string
  avgLTV: number
  count: number
}

interface Props {
  data: LTVData[]
  compact?: boolean
}

const SEGMENT_COLORS: Record<string, string> = {
  VIP: '#8b5cf6',
  PREMIUM: '#f59e0b',
  FREQUENT: '#10b981',
  LOYAL: '#059669',
  HIGH_POTENTIAL: '#6366f1',
  EXPLORER: '#06b6d4',
  NEW: '#3b82f6',
  AT_RISK: '#ef4444',
  DORMANT: '#71717a',
  PROMOTION_HUNTER: '#f97316',
}

const SEGMENT_LABELS: Record<string, string> = {
  VIP: 'VIP',
  PREMIUM: 'Premium',
  FREQUENT: 'Frecuente',
  LOYAL: 'Leal',
  HIGH_POTENTIAL: 'Alto Potencial',
  EXPLORER: 'Explorador',
  NEW: 'Nuevo',
  AT_RISK: 'En Riesgo',
  DORMANT: 'Dormido',
  PROMOTION_HUNTER: 'Promo Hunter',
}

function fmtCurrency(n: number) {
  return `$${toPesos(n).toLocaleString('es-AR')}`
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const entry = payload[0].payload
  const label = SEGMENT_LABELS[entry.segment] ?? entry.segment
  return (
    <div className="bg-white rounded-xl border border-border p-3 shadow-lg text-xs max-w-[240px]">
      <p className="font-bold text-foreground mb-1">{label}</p>
      <p className="text-muted-foreground">
        Gasto promedio: <span className="font-bold text-foreground">{fmtCurrency(entry.avgLTV)}</span>
      </p>
      <p className="text-muted-foreground">
        {entry.count} cliente{entry.count !== 1 ? 's' : ''} en este segmento
      </p>
    </div>
  )
}

export default function LTVDistributionChart({ data, compact = false }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-border p-4 bg-card">
        <p className="text-xs text-muted-foreground">No hay datos de LTV disponibles todavía.</p>
      </div>
    )
  }

  // Filtrar segmentos con 0 y ordenar por LTV
  const chartData = data
    .filter(d => d.count > 0 && d.avgLTV > 0)
    .sort((a, b) => b.avgLTV - a.avgLTV)

  if (compact) {
    return (
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="segment"
              tick={{ fontSize: 9, fill: '#9ca3af' }}
              width={60}
              tickFormatter={(v) => SEGMENT_LABELS[v] ?? v}
            />
            <Bar dataKey="avgLTV" radius={[0, 4, 4, 0]} barSize={14}>
              {chartData.map((entry, idx) => (
                <Cell key={idx} fill={SEGMENT_COLORS[entry.segment] ?? '#71717a'} />
              ))}
            </Bar>
            <Tooltip content={<CustomTooltip />} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border p-4 bg-card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Gasto Promedio por Segmento</h3>
        <span className="text-xs text-muted-foreground">Lifetime Value</span>
      </div>

      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="segment"
              tick={{ fontSize: 9, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => SEGMENT_LABELS[v] ?? v}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="avgLTV" radius={[4, 4, 0, 0]} barSize={32}>
              {chartData.map((entry, idx) => (
                <Cell key={idx} fill={SEGMENT_COLORS[entry.segment] ?? '#71717a'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Texto descriptivo */}
      <div className="space-y-1 text-xs text-muted-foreground">
        {chartData.map((d, i) => (
          <p key={i}>
            Los <span className="font-semibold text-foreground">{SEGMENT_LABELS[d.segment] ?? d.segment}</span> gastan en promedio{' '}
            <span className="font-semibold text-foreground">{fmtCurrency(d.avgLTV)}</span> por cliente.
          </p>
        ))}
      </div>
    </div>
  )
}
