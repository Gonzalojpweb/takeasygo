'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { toPesos } from '@takeasygo/business'
import { cn } from '@/lib/utils'

interface KPIsMesProps {
  tenantSlug: string
  data?: KPIsData
}

interface KPIsData {
  revenue: number
  avgTicket: number
  cancRate: number
  orderCount: number
  growth: string
  prevRevenue: number
  prevCancRate: number | null
  cancTrend: 'better' | 'worse' | 'same' | null
}

function fmtPesos(cents: number) {
  return `$${toPesos(cents).toLocaleString('es-AR')}`
}

export default function KPIsMes({ tenantSlug, data: prefetchedData }: KPIsMesProps) {
  const [data, setData] = useState<KPIsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (prefetchedData) {
      setData(prefetchedData)
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchKPIs() {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch(`/api/${tenantSlug}/admin/dashboard/kpis`)
        if (!res.ok) throw new Error('Error al cargar KPIs')
        const json = await res.json()
        if (!cancelled) setData(json)
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Error al cargar KPIs')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchKPIs()
    return () => { cancelled = true }
  }, [tenantSlug, prefetchedData])

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="bg-card border-2 border-border/60 shadow-lg rounded-2xl overflow-hidden">
            <CardContent className="p-4">
              <Skeleton className="h-3 w-20 mb-3" />
              <Skeleton className="h-7 w-28 mb-2" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="col-span-full bg-card border-2 border-destructive/20 shadow-lg rounded-2xl overflow-hidden">
          <CardContent className="p-4">
            <p className="text-sm text-destructive font-medium">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) return null

  const growthNum = parseFloat(data.growth)
  const isGrowthPositive = growthNum > 0

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {/* Ingresos del mes */}
      <Card className="bg-card border-2 border-border/60 shadow-lg rounded-2xl overflow-hidden group hover:shadow-2xl hover:border-primary/30 transition-all duration-500">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Ingresos del mes</p>
          <p className="text-xl font-bold text-foreground tabular-nums">{fmtPesos(data.revenue)}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold border',
                isGrowthPositive
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                  : growthNum < 0
                    ? 'bg-destructive/10 text-destructive border-destructive/20'
                    : 'bg-muted text-muted-foreground border-border/40'
              )}
            >
              {isGrowthPositive ? '↑' : growthNum < 0 ? '↓' : ''}
              {data.growth}%
            </span>
            <span className="text-[10px] text-muted-foreground">vs mes ant.</span>
          </div>
        </CardContent>
      </Card>

      {/* Ticket promedio */}
      <Card className="bg-card border-2 border-border/60 shadow-lg rounded-2xl overflow-hidden group hover:shadow-2xl hover:border-primary/30 transition-all duration-500">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Ticket promedio</p>
          <p className="text-xl font-bold text-foreground tabular-nums">{fmtPesos(data.avgTicket)}</p>
          <p className="text-[10px] text-muted-foreground mt-1.5">Basado en pedidos confirmados</p>
        </CardContent>
      </Card>

      {/* Tasa de cancelación */}
      <Card className="bg-card border-2 border-border/60 shadow-lg rounded-2xl overflow-hidden group hover:shadow-2xl hover:border-primary/30 transition-all duration-500">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Tasa de cancelación</p>
          <p className={cn(
            'text-xl font-bold tabular-nums',
            data.cancRate > 15 ? 'text-destructive' : data.cancRate > 5 ? 'text-amber-500' : 'text-foreground'
          )}>
            {data.cancRate}%
          </p>
          <div className="flex items-center gap-1.5 mt-1.5">
            {data.cancTrend !== null ? (
              <>
                <span className={cn(
                  'inline-flex items-center gap-0.5',
                  data.cancTrend === 'better' ? 'text-emerald-600' : data.cancTrend === 'worse' ? 'text-destructive' : 'text-muted-foreground'
                )}>
                  {data.cancTrend === 'better' && <TrendingDown size={12} />}
                  {data.cancTrend === 'worse' && <TrendingUp size={12} />}
                  {data.cancTrend === 'same' && <Minus size={12} />}
                </span>
                <span className={cn(
                  'text-[10px] font-medium',
                  data.cancTrend === 'better' ? 'text-emerald-600' : data.cancTrend === 'worse' ? 'text-destructive' : 'text-muted-foreground'
                )}>
                  {data.cancTrend === 'better' ? 'Mejoró' : data.cancTrend === 'worse' ? 'Empeoró' : 'Igual'} vs mes ant.
                </span>
              </>
            ) : (
              <span className="text-[10px] text-muted-foreground">Sin dato anterior</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Órdenes del mes */}
      <Card className="bg-card border-2 border-border/60 shadow-lg rounded-2xl overflow-hidden group hover:shadow-2xl hover:border-primary/30 transition-all duration-500">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Órdenes del mes</p>
          <p className="text-xl font-bold text-foreground tabular-nums">{data.orderCount.toLocaleString('es-AR')}</p>
          <p className="text-[10px] text-muted-foreground mt-1.5">Pedidos confirmados</p>
        </CardContent>
      </Card>
    </div>
  )
}
