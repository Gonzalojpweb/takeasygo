import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import CustomerProfile from '@/models/CustomerProfile'
import { canAccess } from '@/lib/plans'
import { getCustomerIntelligenceSummary } from '@/lib/cis/tia-bridge'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/[tenant]/crm/metrics — Métricas agregadas de clientes CIS
// ─────────────────────────────────────────────────────────────────────────────
// Devuelve: distribución de segmentos, health score promedio,
// contadores por estado, y KPIs del CRM.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
    if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!canAccess(tenant.plan, 'crm')) {
      return NextResponse.json({ error: 'CRM no disponible en tu plan actual.' }, { status: 403 })
    }

    const summary = await getCustomerIntelligenceSummary(tenant._id)

    // Métricas adicionales
    const avgMetrics = await CustomerProfile.aggregate([
      { $match: { tenantId: tenant._id } },
      {
        $group: {
          _id: null,
          avgTicket: { $avg: '$avgTicket' },
          avgVisitFrequency: { $avg: '$visitFrequency' },
          avgConversionRate: { $avg: '$conversionRate' },
          totalRevenue: { $sum: '$totalSpent' },
        },
      },
    ])

    const metrics = avgMetrics[0] ?? {
      avgTicket: 0, avgVisitFrequency: 0, avgConversionRate: 0, totalRevenue: 0,
    }

    return NextResponse.json({
      totalCustomers: summary.totalCustomers,
      avgHealthScore: summary.avgHealthScore,
      segmentDistribution: summary.segmentDistribution,
      atRiskCount: summary.atRiskCount,
      dormantCount: summary.dormantCount,
      vipCount: summary.vipCount,
      avgTicket: Math.round(metrics.avgTicket ?? 0),
      avgVisitFrequency: Math.round((metrics.avgVisitFrequency ?? 0) * 100) / 100,
      avgConversionRate: Math.round((metrics.avgConversionRate ?? 0) * 100),
      totalRevenue: metrics.totalRevenue ?? 0,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
