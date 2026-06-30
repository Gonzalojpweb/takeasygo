'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

// ─────────────────────────────────────────────────────────────────────────────
// SegmentDistributionChart — Distribución de segmentos del tenant
// ─────────────────────────────────────────────────────────────────────────────
// Patrón: Usa recharts PieChart (donut). Labels en español.
// Lenguaje humano: texto descriptivo con cada métrica en lenguaje simple.
// ─────────────────────────────────────────────────────────────────────────────

interface SegmentData {
  segment: string
  count: number
}

interface Props {
  data: SegmentData[]
  totalCustomers: number
  compact?: boolean
  onSegmentClick?: (segment: string) => void
}

const SEGMENT_CONFIG: Record<string, { label: string; color: string }> = {
  VIP: { label: 'VIP', color: '#8b5cf6' },
  PREMIUM: { label: 'Premium', color: '#f59e0b' },
  FREQUENT: { label: 'Frecuente', color: '#10b981' },
  LOYAL: { label: 'Leal', color: '#059669' },
  HIGH_POTENTIAL: { label: 'Alto Potencial', color: '#6366f1' },
  EXPLORER: { label: 'Explorador', color: '#06b6d4' },
  NEW: { label: 'Nuevo', color: '#3b82f6' },
  AT_RISK: { label: 'En Riesgo', color: '#ef4444' },
  DORMANT: { label: 'Dormido', color: '#71717a' },
  PROMOTION_HUNTER: { label: 'Promo Hunter', color: '#f97316' },
}

function getSegmentColor(segment: string): string {
  return SEGMENT_CONFIG[segment]?.color ?? '#71717a'
}

function getSegmentLabel(segment: string): string {
  return SEGMENT_CONFIG[segment]?.label ?? segment
}

function getSegmentDescription(segment: string, count: number, total: number): string {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  switch (segment) {
    case 'VIP': return `${count} clientes (${pct}%) son tus mejores. Alta frecuencia y alto gasto.`
    case 'PREMIUM': return `${count} clientes (${pct}%) gastan mucho pero no vienen seguido.`
    case 'FREQUENT': return `${count} clientes (${pct}%) vienen seguido. Son tu base más confiable.`
    case 'LOYAL': return `${count} clientes (${pct}%) son recientes y constantes.`
    case 'HIGH_POTENTIAL': return `${count} clientes (${pct}%) tienen potencial para ser VIP.`
    case 'EXPLORER': return `${count} clientes (${pct}%) prueban cosas nuevas.`
    case 'NEW': return `${count} clientes (${pct}%) son nuevos. Primera o segunda compra.`
    case 'AT_RISK': return `${count} clientes (${pct}%) empezaron a bajar la frecuencia. ¡Actuá!`
    case 'DORMANT': return `${count} clientes (${pct}%) no vienen hace tiempo. Último intento.`
    case 'PROMOTION_HUNTER': return `${count} clientes (${pct}%) solo compran con descuento.`
    default: return `${count} clientes (${pct}%) en este segmento.`
  }
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const entry = payload[0].payload
  const config = SEGMENT_CONFIG[entry.segment] ?? { label: entry.segment, color: '#71717a' }
  return (
    <div className="bg-white rounded-xl border border-border p-3 shadow-lg text-xs max-w-[220px]">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: config.color }} />
        <span className="font-bold text-foreground">{config.label}</span>
      </div>
      <p className="text-muted-foreground leading-relaxed">
        {getSegmentDescription(entry.segment, entry.count, entry.total || 1)}
      </p>
    </div>
  )
}

export default function SegmentDistributionChart({ data, totalCustomers, compact = false, onSegmentClick }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-border p-4 bg-card">
        <p className="text-xs text-muted-foreground">No hay datos de segmentos disponibles.</p>
      </div>
    )
  }

  // Filtrar segmentos con 0 y ordenar por cantidad
  const chartData = data
    .filter(d => d.count > 0)
    .map(d => ({ ...d, total: totalCustomers }))
    .sort((a, b) => b.count - a.count)

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={50}
                dataKey="count"
                paddingAngle={2}
                onClick={onSegmentClick ? (_, idx) => onSegmentClick(chartData[idx].segment) : undefined}
                style={onSegmentClick ? { cursor: 'pointer' } : undefined}
              >
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={getSegmentColor(entry.segment)} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Mini leyenda */}
        <div className="flex flex-wrap gap-1.5">
          {chartData.slice(0, 5).map((d, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getSegmentColor(d.segment) }} />
              {getSegmentLabel(d.segment)} ({d.count})
            </span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border p-4 bg-card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Distribución de Segmentos</h3>
        <span className="text-xs text-muted-foreground">{totalCustomers} clientes totales</span>
      </div>

      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              dataKey="count"
              paddingAngle={2}
              onClick={onSegmentClick ? (_, idx) => onSegmentClick(chartData[idx].segment) : undefined}
              style={onSegmentClick ? { cursor: 'pointer' } : undefined}
            >
              {chartData.map((entry, idx) => (
                <Cell key={idx} fill={getSegmentColor(entry.segment)} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Descripción textual de cada segmento */}
      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        {chartData.map((d, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 text-xs ${onSegmentClick ? 'cursor-pointer hover:bg-muted/30 rounded-lg p-1 -m-1' : ''}`}
            onClick={onSegmentClick ? () => onSegmentClick(d.segment) : undefined}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: getSegmentColor(d.segment) }} />
            <span className="text-muted-foreground leading-relaxed">
              {getSegmentDescription(d.segment, d.count, totalCustomers)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
