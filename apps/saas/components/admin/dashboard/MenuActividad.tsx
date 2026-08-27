'use client'

import { useState, useEffect } from 'react'
import { Flame, Heart, BarChart3 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Props {
  tenantSlug: string
  data?: DashboardData
}

interface MenuItem {
  _id: string
  name: string
  category: string
  count: number
  likesCount: number
}

interface FunnelStep {
  menuOpened: number
  dishViewed: number
  dishAdded: number
  checkoutStarted: number
  orderCompleted: number
}

interface DashboardData {
  mostSold: MenuItem[]
  topLiked: MenuItem[]
  funnel: FunnelStep
}

const FUNNEL_STEPS = [
  { key: 'menuOpened', label: 'Abrieron el menú', color: 'bg-blue-500' },
  { key: 'dishViewed', label: 'Vieron un plato', color: 'bg-indigo-500' },
  { key: 'dishAdded', label: 'Agregaron al carrito', color: 'bg-violet-500' },
  { key: 'checkoutStarted', label: 'Empezaron el checkout', color: 'bg-purple-500' },
  { key: 'orderCompleted', label: 'Completaron la compra', color: 'bg-green-500' },
] as const

export default function MenuActividad({ tenantSlug, data: prefetchedData }: Props) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (prefetchedData) {
      setData(prefetchedData)
      setLoading(false)
      return
    }

    fetch(`/api/${tenantSlug}/admin/dashboard/menu-actividad`)
      .then((res) => res.json())
      .then((json) => setData(json))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tenantSlug, prefetchedData])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-muted/30 rounded-xl p-4 space-y-3">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="h-8 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-muted/30 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">
          🔥 Lo que más se vende
        </h3>
        <div>
          {data.mostSold.slice(0, 5).map((item, index) => (
            <div key={item._id} className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-b-0">
              <span className="text-xs font-bold text-muted-foreground w-5 text-right">
                {index + 1}
              </span>
              <span className="text-sm font-semibold truncate flex-1">
                {item.name}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {item.category}
              </span>
              <span className="text-sm font-bold text-primary">
                {item.count} u.
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-muted/30 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">
          ❤️ Lo que más gusta
        </h3>
        <div>
          {data.topLiked.slice(0, 5).map((item, index) => (
            <div key={item._id} className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-b-0">
              <span className="text-xs font-bold text-muted-foreground w-5 text-right">
                {index + 1}
              </span>
              <span className="text-sm font-semibold truncate flex-1">
                {item.name}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {item.category}
              </span>
              <span className="flex items-center gap-1">
                <Heart size={12} className="text-red-500 fill-red-500" />
                <span className="text-sm font-bold text-primary">
                  {item.likesCount}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-muted/30 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">
          📊 Atención en tu menú
        </h3>
        <div className="space-y-1">
          {FUNNEL_STEPS.map((step) => {
            const value = data.funnel[step.key]
            const base = data.funnel.menuOpened
            const pct = base > 0 ? Math.round((value / base) * 100) : 0
            return (
              <div key={step.key} className="flex items-center gap-2 py-1.5">
                <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', step.color)} />
                <span className="text-sm flex-1">
                  {step.label}
                </span>
                <span className="text-sm font-bold tabular-nums">
                  {value.toLocaleString('es-AR')}
                </span>
                <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">
                  {pct}%
                </span>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/30">
          {(() => {
            const steps = FUNNEL_STEPS.map((s) => ({
              ...s,
              value: data.funnel[s.key],
            }))
            let maxDrop = 0
            let dropLabel = ''
            for (let i = 1; i < steps.length; i++) {
              const drop = steps[i - 1].value - steps[i].value
              if (drop > maxDrop) {
                maxDrop = drop
                dropLabel = `${steps[i - 1].label} → ${steps[i].label}`
              }
            }
            if (maxDrop === 0) return 'Todos completan el recorrido.'
            return `Mayor caída: ${dropLabel}`
          })()}
        </p>
      </div>
    </div>
  )
}
