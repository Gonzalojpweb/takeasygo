'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CustomerSegmentBadge.tsx — Badge visual del segmento del cliente
// ─────────────────────────────────────────────────────────────────────────────
// Muestra el segmento actual con color y estilo consistentes.
// Patrón: Replica la estructura de tags existente en CRMView.
// ─────────────────────────────────────────────────────────────────────────────

type Segment = 'NEW' | 'FREQUENT' | 'VIP' | 'PREMIUM' | 'EXPLORER' | 'LOYAL' | 'AT_RISK' | 'DORMANT' | 'PROMOTION_HUNTER' | 'HIGH_POTENTIAL'

interface Props {
  segment: Segment
  compact?: boolean
}

const SEGMENT_CONFIG: Record<Segment, { label: string; color: string }> = {
  NEW: { label: 'Nuevo', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  FREQUENT: { label: 'Frecuente', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  VIP: { label: 'VIP', color: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
  PREMIUM: { label: 'Premium', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  EXPLORER: { label: 'Explorador', color: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20' },
  LOYAL: { label: 'Leal', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  AT_RISK: { label: 'En Riesgo', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
  DORMANT: { label: 'Dormido', color: 'bg-zinc-500/10 text-zinc-600 border-zinc-500/20' },
  PROMOTION_HUNTER: { label: 'Promo Hunter', color: 'bg-orange-500/10 text-orange-600 border-orange-500/20' },
  HIGH_POTENTIAL: { label: 'Alto Potencial', color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20' },
}

export default function CustomerSegmentBadge({ segment, compact = false }: Props) {
  const config = SEGMENT_CONFIG[segment] ?? { label: segment, color: 'bg-zinc-500/10 text-zinc-600' }

  if (compact) {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${config.color}`}>
        {config.label}
      </span>
    )
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-bold ${config.color}`}>
      {config.label}
    </div>
  )
}
