import { NextResponse } from 'next/server'
import { queryPostHog } from '@/lib/tia/posthog'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function GET(req: Request) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { searchParams } = new URL(req.url)
    const days = parseInt(searchParams.get('days') || '30', 10)
    const tenantSlug = searchParams.get('tenantSlug') || undefined

    // Build property filters
    const properties: any[] = []
    if (tenantSlug) {
      properties.push({ key: 'tenantSlug', value: [tenantSlug], operator: 'exact', type: 'event' })
    }

    // Total reveals
    const totalQuery = {
      kind: 'TrendsQuery' as const,
      dateRange: { date_from: `-${days}d` },
      series: [{ kind: 'EventsNode' as const, event: 'superadmin.revenue_toggled', name: 'superadmin.revenue_toggled' }],
      properties,
    }

    // Breakdown by visible (true/false)
    const breakdownQuery = {
      kind: 'TrendsQuery' as const,
      dateRange: { date_from: `-${days}d` },
      series: [{ kind: 'EventsNode' as const, event: 'superadmin.revenue_toggled', name: 'superadmin.revenue_toggled' }],
      properties,
      breakdown: [{ key: 'visible', type: 'event' as const }],
      breakdown_hide_other: false,
    }

    // Breakdown by tenantSlug
    const tenantBreakdownQuery = {
      kind: 'TrendsQuery' as const,
      dateRange: { date_from: `-${days}d` },
      series: [{ kind: 'EventsNode' as const, event: 'superadmin.revenue_toggled', name: 'superadmin.revenue_toggled' }],
      properties,
      breakdown: [{ key: 'tenantSlug', type: 'event' as const }],
      breakdown_hide_other: false,
    }

    // Trend over time
    const trendQuery = {
      kind: 'TrendsQuery' as const,
      dateRange: { date_from: `-${days}d` },
      series: [{ kind: 'EventsNode' as const, event: 'superadmin.revenue_toggled', name: 'superadmin.revenue_toggled' }],
      interval: 'day' as const,
      properties,
    }

    const [totalResult, breakdownResult, tenantResult, trendResult] = await Promise.all([
      queryPostHog(totalQuery),
      queryPostHog(breakdownQuery),
      queryPostHog(tenantBreakdownQuery),
      queryPostHog(trendQuery),
    ])

    // Parse total
    const totalCount = totalResult?.results?.[0]?.data?.reduce((s: number, v: number) => s + v, 0) ?? 0

    // Parse visible breakdown (show vs hide)
    const visibleData: Record<string, number> = {}
    if (breakdownResult?.results) {
      for (const r of breakdownResult.results) {
        const label = r.breakdown_value ?? 'unknown'
        const sum = r.data?.reduce((s: number, v: number) => s + v, 0) ?? 0
        visibleData[label] = sum
      }
    }

    // Parse tenant breakdown
    const tenantData: { slug: string; count: number }[] = []
    if (tenantResult?.results) {
      for (const r of tenantResult.results) {
        const slug = r.breakdown_value ?? 'unknown'
        const sum = r.data?.reduce((s: number, v: number) => s + v, 0) ?? 0
        if (sum > 0) tenantData.push({ slug, count: sum })
      }
      tenantData.sort((a, b) => b.count - a.count)
    }

    // Parse trend
    const trend: { date: string; count: number }[] = []
    if (trendResult?.results?.[0]) {
      const labels = trendResult.results[0].labels ?? []
      const data = trendResult.results[0].data ?? []
      for (let i = 0; i < labels.length; i++) {
        trend.push({ date: labels[i], count: data[i] ?? 0 })
      }
    }

    return NextResponse.json({
      totalCount,
      visibleData,
      tenantBreakdown: tenantData,
      trend,
      days,
      tenantSlug: tenantSlug || null,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener datos de visibilidad' }, { status: 500 })
  }
}
