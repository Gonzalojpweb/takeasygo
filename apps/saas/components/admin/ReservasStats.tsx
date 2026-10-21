'use client'

// ── ReservasStats ────────────────────────────────────────────────────────────
//
// Resumen de reservas de los últimos 30 días para la sede elegida (o el
// consolidado): reservas, comensales, no-show y cancelaciones.

import { useEffect, useState } from 'react'

interface Stats {
  total: number
  covers: number
  noShowRate: number
  cancelRate: number
  byStatus: Record<string, number>
}

export default function ReservasStats({ tenantSlug, locationId }: { tenantSlug: string; locationId: string | null }) {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    let cancelled = false
    const qs = new URLSearchParams({ days: '30' })
    if (locationId) qs.set('locationId', locationId)
    fetch(`/api/${tenantSlug}/reservas/stats?${qs.toString()}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (!cancelled) setStats(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [tenantSlug, locationId])

  if (!stats) return null

  const items = [
    { label: 'Reservas (30 días)', value: String(stats.total) },
    { label: 'Comensales', value: String(stats.covers) },
    { label: 'No-show', value: `${stats.noShowRate}%`, hint: `${stats.byStatus.no_show ?? 0} sin asistir` },
    { label: 'Cancelaciones', value: `${stats.cancelRate}%`, hint: `${stats.byStatus.cancelled ?? 0} canceladas` },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map(item => (
        <div key={item.label} className="rounded-2xl border border-border/60 bg-card px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">{item.label}</p>
          <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">{item.value}</p>
          {item.hint && <p className="text-[11px] text-muted-foreground mt-0.5">{item.hint}</p>}
        </div>
      ))}
    </div>
  )
}
