/**
 * Admin Dashboard — KPIs del mes
 *
 * GET /api/[tenant]/admin/dashboard/kpis
 *
 * Returns monthly KPIs: revenue, avg ticket, cancellation rate, order count,
 * plus comparison with previous month.
 * Uses only Order model to avoid TDZ.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveDashboardScope } from '@/lib/dashboard-scope'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params

    const resolved = await resolveDashboardScope<{ _id: any }>(request, tenantSlug)
    if (!resolved.ok) return resolved.response
    const { tenant, match: sedeMatch } = resolved.scope

    const OrderMod = await import('@/models/Order')
    const Order = OrderMod.default

    const tenantId = tenant._id
    const now = new Date()

    // Current month boundaries
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    // Previous month boundaries
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

    const [thisMonthData, prevMonthData] = await Promise.all([
      Order.aggregate([
        { $match: { tenantId, ...sedeMatch, createdAt: { $gte: startOfMonth, $lte: endOfMonth }, status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { tenantId, ...sedeMatch, createdAt: { $gte: startOfPrevMonth, $lte: endOfPrevMonth }, status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),
      // Cancellation rate this month
      Order.aggregate([
        { $match: { tenantId, ...sedeMatch, createdAt: { $gte: startOfMonth, $lte: endOfMonth } } },
        { $group: { _id: null, total: { $sum: 1 }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } } } },
      ]),
    ])

    const thisMonth = thisMonthData[0] || { total: 0, count: 0 }
    const prevMonth = prevMonthData[0] || { total: 0, count: 0 }
    const cancData = { total: 0, cancelled: 0, ...(await Order.aggregate([
      { $match: { tenantId, ...sedeMatch, createdAt: { $gte: startOfMonth, $lte: endOfMonth } } },
      { $group: { _id: null, total: { $sum: 1 }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } } } },
    ]).then(r => r[0] || { total: 0, cancelled: 0 })) }

    // Recalculate cancData properly
    const cancAgg = await Order.aggregate([
      { $match: { tenantId, ...sedeMatch, createdAt: { $gte: startOfMonth, $lte: endOfMonth } } },
      { $group: { _id: null, total: { $sum: 1 }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } } } },
    ])
    const canc = cancAgg[0] || { total: 0, cancelled: 0 }

    const revenue = thisMonth.total
    const prevRevenue = prevMonth.total
    const avgTicket = thisMonth.count > 0 ? Math.round(thisMonth.total / thisMonth.count) : 0
    const cancRate = canc.total > 0 ? Math.round((canc.cancelled / canc.total) * 100) : 0

    // Growth vs previous month
    const growth = prevRevenue > 0
      ? (((revenue - prevRevenue) / prevRevenue) * 100).toFixed(1)
      : '0'

    // Previous month canc rate for comparison
    const prevCancAgg = await Order.aggregate([
      { $match: { tenantId, ...sedeMatch, createdAt: { $gte: startOfPrevMonth, $lte: endOfPrevMonth } } },
      { $group: { _id: null, total: { $sum: 1 }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } } } },
    ])
    const prevCanc = prevCancAgg[0] || { total: 0, cancelled: 0 }
    const prevCancRate = prevCanc.total > 0 ? Math.round((prevCanc.cancelled / prevCanc.total) * 100) : null

    const cancTrend: 'better' | 'worse' | 'same' | null =
      prevCancRate === null ? null
        : cancRate < prevCancRate ? 'better'
          : cancRate > prevCancRate ? 'worse'
            : 'same'

    return NextResponse.json({
      revenue,
      avgTicket,
      cancRate,
      orderCount: thisMonth.count,
      growth,
      prevRevenue,
      prevCancRate,
      cancTrend,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[dashboard/kpis GET]', msg)
    return NextResponse.json({ error: 'Error al obtener KPIs', detail: msg }, { status: 500 })
  }
}
