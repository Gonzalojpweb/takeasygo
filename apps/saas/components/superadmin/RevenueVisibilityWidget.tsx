'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Eye, EyeOff } from 'lucide-react'

interface RevenueVisibilityData {
  totalCount: number
  visibleData: Record<string, number>
  tenantBreakdown: { slug: string; count: number }[]
  trend: { date: string; count: number }[]
  days: number
  tenantSlug: string | null
}

interface Props {
  initialData: RevenueVisibilityData | null
  tenantSlugs: string[]
}

export default function RevenueVisibilityWidget({ initialData, tenantSlugs }: Props) {
  const [data, setData] = useState<RevenueVisibilityData | null>(initialData)
  const [loading, setLoading] = useState(false)
  const [selectedTenant, setSelectedTenant] = useState<string>('')
  const [days, setDays] = useState(30)
  const hasFetchedInitial = useRef(true)

  const fetchData = useCallback(async (tenant: string, period: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ days: String(period) })
      if (tenant) params.set('tenantSlug', tenant)
      const res = await fetch(`/api/superadmin/analytics/revenue-visibility?${params}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (hasFetchedInitial.current) {
      hasFetchedInitial.current = false
      return
    }
    fetchData(selectedTenant, days)
  }, [selectedTenant, days, fetchData])

  const showCount = data?.visibleData['true'] ?? 0
  const hideCount = data?.visibleData['false'] ?? 0
  const total = showCount + hideCount
  const showPct = total > 0 ? Math.round((showCount / total) * 100) : 0

  return (
    <Card className="bg-card border-2 border-border/60 shadow-lg rounded-3xl overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#FAB300]/10">
            <Eye size={20} className="text-[#FAB300]" />
          </div>
          <div>
            <CardTitle className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.2em]">
              Revenue Visibility
            </CardTitle>
            <p className="text-foreground text-[10px] font-medium mt-0.5">
              Admin clicks to reveal/hide revenue
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="text-[10px] font-bold uppercase tracking-tighter bg-background border border-border/60 rounded-lg px-2 py-1 text-foreground"
          >
            <option value={7}>7d</option>
            <option value={30}>30d</option>
            <option value={90}>90d</option>
          </select>
          <select
            value={selectedTenant}
            onChange={(e) => setSelectedTenant(e.target.value)}
            className="text-[10px] font-bold uppercase tracking-tighter bg-background border border-border/60 rounded-lg px-2 py-1 text-foreground max-w-[140px]"
          >
            <option value="">Todos los tenants</option>
            {tenantSlugs.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#FAB300] border-t-transparent" />
          </div>
        )}
        {!loading && data && (
          <div className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-foreground text-2xl font-bold tracking-tighter tabular-nums">{data.totalCount}</p>
                <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-tighter">Total reveals</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <Eye size={14} className="text-[#2FBF71]" />
                  <p className="text-[#2FBF71] text-2xl font-bold tracking-tighter tabular-nums">{showCount}</p>
                </div>
                <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-tighter">Shown ({showPct}%)</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <EyeOff size={14} className="text-muted-foreground" />
                  <p className="text-foreground text-2xl font-bold tracking-tighter tabular-nums">{hideCount}</p>
                </div>
                <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-tighter">Hidden ({100 - showPct}%)</p>
              </div>
            </div>

            {/* Trend mini chart */}
            {data.trend.length > 0 && (
              <div>
                <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-tighter mb-2">Tendencia diaria</p>
                <div className="flex items-end gap-0.5 h-12">
                  {data.trend.map((d, i) => {
                    const max = Math.max(...data.trend.map((t) => t.count), 1)
                    const height = Math.max((d.count / max) * 48, 2)
                    return (
                      <div
                        key={i}
                        className="flex-1 rounded-sm bg-[#FAB300]/60 min-w-[2px]"
                        style={{ height: `${height}px` }}
                        title={`${d.date}: ${d.count}`}
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {/* Tenant breakdown */}
            {data.tenantBreakdown.length > 0 && (
              <div>
                <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-tighter mb-2">Por tenant</p>
                <div className="space-y-1.5">
                  {data.tenantBreakdown.map((t) => {
                    const pct = total > 0 ? Math.round((t.count / data.totalCount) * 100) : 0
                    return (
                      <div key={t.slug} className="flex items-center gap-2">
                        <span className="text-foreground text-xs font-medium truncate max-w-[120px]">{t.slug}</span>
                        <div className="flex-1 h-1.5 bg-border/30 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#FAB300] rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-muted-foreground text-[10px] font-bold tabular-nums w-8 text-right">{t.count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {data.totalCount === 0 && (
              <div className="text-center py-6">
                <Eye size={24} className="text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-muted-foreground text-xs">Sin datos en los últimos {data.days} días</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
