'use client'

import { useState, useEffect } from 'react'
import { ShoppingBag, Clock, CheckCircle, XCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface DashboardStats {
  total: number
  pending: number
  confirmed: number
  cancelled: number
}

const CARDS = [
  { key: 'total', label: 'Total pedidos', icon: ShoppingBag, bg: 'bg-primary/10', color: 'text-primary' },
  { key: 'pending', label: 'Pendientes', icon: Clock, bg: 'bg-amber-50', color: 'text-amber-500' },
  { key: 'confirmed', label: 'Confirmados', icon: CheckCircle, bg: 'bg-green-50', color: 'text-green-500' },
  { key: 'cancelled', label: 'Cancelados', icon: XCircle, bg: 'bg-red-50', color: 'text-red-500' },
] as const

export default function StatsCards({ tenantSlug }: { tenantSlug: string }) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchStats() {
      try {
        setLoading(true)
        setError(false)
        const res = await fetch(`/api/${tenantSlug}/admin/dashboard/stats`)
        if (!res.ok) throw new Error('Error fetching stats')
        const data = await res.json()
        if (!cancelled) setStats(data)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchStats()
    return () => { cancelled = true }
  }, [tenantSlug])

  if (error) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {CARDS.map(c => (
          <Card key={c.key} className="p-3 rounded-xl border shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{c.label}</span>
              <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center', c.bg)}>
                <c.icon size={18} className={c.color} />
              </div>
            </div>
            <p className="text-xl font-bold mt-2 tabular-nums">—</p>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {CARDS.map(c => (
        <Card key={c.key} className="p-3 rounded-xl border shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{c.label}</span>
            <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center', c.bg)}>
              <c.icon size={18} className={c.color} />
            </div>
          </div>
          {loading ? (
            <div className="mt-2 h-6 w-16 animate-pulse rounded bg-muted" />
          ) : (
            <p className="text-xl font-bold mt-2 tabular-nums">
              {stats?.[c.key] ?? 0}
            </p>
          )}
        </Card>
      ))}
    </div>
  )
}
