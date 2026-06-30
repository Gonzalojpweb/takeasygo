import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import ReportsDashboard from '@/components/admin/ReportsDashboard'
import type { Plan } from '@/lib/plans'
import { PLAN_LABELS, canAccess, requiredPlanFor } from '@/lib/plans'
import { Lock } from 'lucide-react'

const UPSELL_SOURCES = ['upsell_sheet', 'checkout_banner']

export default async function ReportsPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean<{ _id: import('mongoose').Types.ObjectId; plan: Plan }>()
  if (!tenant) notFound()

  const plan: Plan = tenant.plan ?? 'try'

  // try plan = locked
  if (!canAccess(plan, 'reports')) {
    const required = requiredPlanFor('reports')
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center">
          <Lock size={32} className="text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Reportes y Analytics</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Esta funcionalidad está disponible en el plan{' '}
            <span className="font-bold text-foreground">{PLAN_LABELS[required]}</span>.
            Contactá al soporte para actualizar tu plan.
          </p>
        </div>
        <div className="px-6 py-3 rounded-2xl bg-muted text-sm font-bold text-muted-foreground">
          Tu plan actual: {PLAN_LABELS[plan]}
        </div>
      </div>
    )
  }

  const tenantId = tenant._id
  const isFullPlan = plan === 'full'

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
  const last90days = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  const [
    ordersThisMonth,
    ordersLastMonth,
    topItems,
    recentOrders,
    cancellationData,
    cancellationPrevData,
    hourlyData,
    tppData,
    onTimeData,
    paymentData,
    recompraData,
    recompraBreakdownData,
    categoryRevenueData,
    dailyTrendData,
    locationRevenueData,
    upsellAddsData,
    upsellConversionsData,
  ] = await Promise.all([
    // Revenue y count del mes actual (sin cancelados)
    Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: startOfMonth }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
    ]),
    // Mes anterior
    Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
    ]),
    // Top 5 ítems
    Order.aggregate([
      { $match: { tenantId, status: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.name', total: { $sum: '$items.quantity' }, revenue: { $sum: '$items.subtotal' } } },
      { $sort: { total: -1 } },
      { $limit: 5 }
    ]),
    // Órdenes recientes
    Order.find({ tenantId, status: { $ne: 'cancelled' } })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
    // Tasa de cancelación — total del mes vs canceladas
    Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: startOfMonth } } },
      { $group: {
        _id: null,
        total: { $sum: 1 },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }
      }}
    ]),
    // Tasa de cancelación mes anterior (para tendencia) — solo full
    isFullPlan ? Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
      { $group: {
        _id: null,
        total: { $sum: 1 },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }
      }}
    ]) : Promise.resolve([]),
    // Distribución horaria completa — solo full
    isFullPlan ? Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: startOfMonth }, status: { $ne: 'cancelled' } } },
      { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]) : Promise.resolve([]),
    // TPP — solo full
    isFullPlan ? Order.aggregate([
      { $match: {
        tenantId,
        createdAt: { $gte: startOfMonth },
        'statusTimestamps.confirmedAt': { $ne: null },
        'statusTimestamps.readyAt': { $ne: null },
      }},
      { $project: {
        tppMs: { $subtract: ['$statusTimestamps.readyAt', '$statusTimestamps.confirmedAt'] }
      }},
      { $group: {
        _id: null,
        avgMs: { $avg: '$tppMs' },
        stdMs: { $stdDevPop: '$tppMs' },
        count: { $sum: 1 }
      }}
    ]) : Promise.resolve([]),
    // % pedidos en tiempo — solo full
    isFullPlan ? Order.aggregate([
      { $match: {
        tenantId,
        createdAt: { $gte: startOfMonth },
        'statusTimestamps.readyAt': { $ne: null },
      }},
      { $lookup: {
        from: 'locations',
        localField: 'locationId',
        foreignField: '_id',
        as: 'location',
      }},
      { $unwind: { path: '$location', preserveNullAndEmptyArrays: false } },
      { $project: {
        isOnTime: { $lte: [
          { $subtract: ['$statusTimestamps.readyAt', '$createdAt'] },
          { $multiply: ['$location.settings.estimatedPickupTime', 60000] }
        ]}
      }},
      { $group: {
        _id: null,
        total: { $sum: 1 },
        onTime: { $sum: { $cond: ['$isOnTime', 1, 0] } }
      }}
    ]) : Promise.resolve([]),
    // Conversión de pagos MP — solo full
    isFullPlan ? Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: startOfMonth }, 'payment.method': 'mercadopago' } },
      { $group: {
        _id: null,
        total: { $sum: 1 },
        approved: { $sum: { $cond: [{ $eq: ['$payment.status', 'approved'] }, 1, 0] } }
      }}
    ]) : Promise.resolve([]),
    // Tasa de recompra — solo full (usa phoneHash para grouping estable, compatible con PII cifrada)
    isFullPlan ? Order.aggregate([
      { $match: { tenantId, 'customer.phoneHash': { $ne: null }, createdAt: { $gte: last90days } } },
      { $group: { _id: '$customer.phoneHash', count: { $sum: 1 } } },
      { $group: {
        _id: null,
        totalClients: { $sum: 1 },
        recurring: { $sum: { $cond: [{ $gt: ['$count', 1] }, 1, 0] } }
      }}
    ]) : Promise.resolve([]),
    // Breakdown de frecuencia de compra — solo full
    isFullPlan ? Order.aggregate([
      { $match: { tenantId, 'customer.phoneHash': { $ne: null }, createdAt: { $gte: last90days } } },
      { $group: { _id: '$customer.phoneHash', count: { $sum: 1 } } },
      { $bucket: {
        groupBy: '$count',
        boundaries: [1, 2, 3, 99999],
        default: 'other',
        output: { clients: { $sum: 1 } }
      }}
    ]) : Promise.resolve([]),
    // Revenue por categoría — solo full
    isFullPlan ? Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: startOfMonth }, status: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      { $group: {
        _id: '$items.categoryName',
        revenue: { $sum: '$items.subtotal' },
        quantity: { $sum: '$items.quantity' },
      }},
      { $match: { _id: { $nin: [null, ''] } } },
      { $sort: { revenue: -1 } },
    ]) : Promise.resolve([]),
    // Tendencia diaria — solo full
    isFullPlan ? Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: startOfMonth }, status: { $ne: 'cancelled' } } },
      { $group: {
        _id: { $dayOfMonth: '$createdAt' },
        revenue: { $sum: '$total' },
        orders: { $sum: 1 },
      }},
      { $sort: { _id: 1 } },
    ]) : Promise.resolve([]),
    // Revenue por sede — solo full
    isFullPlan ? Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: startOfMonth }, status: { $ne: 'cancelled' } } },
      { $lookup: {
        from: 'locations',
        localField: 'locationId',
        foreignField: '_id',
        as: 'location',
      }},
      { $unwind: { path: '$location', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id: '$location.name',
        revenue: { $sum: '$total' },
        orders: { $sum: 1 },
      }},
      { $sort: { revenue: -1 } },
    ]) : Promise.resolve([]),
    // Upsell adds — solo full (últimos 90 días)
    isFullPlan ? Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: last90days } } },
      { $unwind: '$items' },
      { $match: { 'items.addedFrom': { $in: UPSELL_SOURCES } } },
      { $group: { _id: { name: '$items.name', source: '$items.addedFrom' }, adds: { $sum: '$items.quantity' }, revenue: { $sum: '$items.subtotal' } } },
    ]) : Promise.resolve([]),
    // Upsell conversions (pagadas) — solo full
    isFullPlan ? Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: last90days }, 'payment.status': 'approved' } },
      { $unwind: '$items' },
      { $match: { 'items.addedFrom': { $in: UPSELL_SOURCES } } },
      { $group: { _id: { name: '$items.name', source: '$items.addedFrom' }, conversions: { $sum: '$items.quantity' }, revenue: { $sum: '$items.subtotal' } } },
    ]) : Promise.resolve([]),
  ])

  const thisMonth = ordersThisMonth[0] || { total: 0, count: 0 }
  const lastMonth = ordersLastMonth[0] || { total: 0, count: 0 }

  const revenueGrowth = lastMonth.total > 0
    ? (((thisMonth.total - lastMonth.total) / lastMonth.total) * 100).toFixed(1)
    : '0'

  // Cancelación — mes actual
  const cancRaw = cancellationData[0] || { total: 0, cancelled: 0 }
  const cancRate = cancRaw.total > 0 ? Math.round((cancRaw.cancelled / cancRaw.total) * 100) : 0

  // Cancelación — mes anterior (para tendencia)
  const cancPrevRaw = cancellationPrevData[0] || { total: 0, cancelled: 0 }
  const cancRatePrev = cancPrevRaw.total > 0
    ? Math.round((cancPrevRaw.cancelled / cancPrevRaw.total) * 100)
    : null
  const cancTrend: 'better' | 'worse' | 'same' | null =
    cancRatePrev === null ? null
    : cancRate < cancRatePrev ? 'better'
    : cancRate > cancRatePrev ? 'worse'
    : 'same'

  // Distribución horaria — todas las horas con actividad, ordenadas cronológicamente
  const hourlyDistribution: { hour: number; count: number }[] =
    hourlyData.map((h: any) => ({ hour: h._id as number, count: h.count as number }))
  const peakHour = hourlyDistribution.length > 0
    ? hourlyDistribution.reduce((a, b) => b.count > a.count ? b : a)
    : null

  // TPP
  const tppRaw = tppData[0] || null
  const tppMinutes = tppRaw ? Math.round(tppRaw.avgMs / 60000) : null
  const tppStdMin = tppRaw ? Math.round(tppRaw.stdMs / 60000) : null
  const tppSampleSize = tppRaw?.count ?? 0

  // % en tiempo
  const onTimeRaw = onTimeData[0] || null
  const onTimePct = onTimeRaw && onTimeRaw.total > 0
    ? Math.round((onTimeRaw.onTime / onTimeRaw.total) * 100)
    : null

  // Conversión MP
  const payRaw = paymentData[0] || { total: 0, approved: 0 }
  const payConvPct = payRaw.total > 0 ? Math.round((payRaw.approved / payRaw.total) * 100) : null

  // Recompra — últimos 90 días
  const recompraRaw = recompraData[0] || { totalClients: 0, recurring: 0 }
  const recompraPct = recompraRaw.totalClients > 0
    ? Math.round((recompraRaw.recurring / recompraRaw.totalClients) * 100)
    : null

  // Breakdown de frecuencia de compra — clientes con 1, 2 y 3+ órdenes
  const breakdownMap = Object.fromEntries(
    (recompraBreakdownData as any[]).map((b: any) => [b._id, b.clients])
  )
  const recompraBreakdown = recompraRaw.totalClients > 0
    ? {
        once:   (breakdownMap[1] ?? 0) as number,
        twice:  (breakdownMap[2] ?? 0) as number,
        thrice: (breakdownMap[3] ?? 0) as number,
      }
    : null

  // Revenue por categoría
  const revenueByCategory: { category: string; revenue: number; quantity: number }[] =
    (categoryRevenueData as any[]).map(c => ({
      category: c._id as string,
      revenue: c.revenue as number,
      quantity: c.quantity as number,
    }))

  // Tendencia diaria — rellena días sin pedidos con 0
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dailyMap = Object.fromEntries(
    (dailyTrendData as any[]).map(d => [d._id, { revenue: d.revenue as number, orders: d.orders as number }])
  )
  const dailyTrend: { day: number; revenue: number; orders: number }[] =
    Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      revenue: dailyMap[i + 1]?.revenue ?? 0,
      orders: dailyMap[i + 1]?.orders ?? 0,
    }))

  // Revenue por sede
  const revenueByLocation: { locationName: string; revenue: number; orders: number }[] =
    (locationRevenueData as any[]).map(l => ({
      locationName: (l._id as string) || 'Sin sede',
      revenue: l.revenue as number,
      orders: l.orders as number,
    }))

  // Upsell analytics — merge adds + conversions
  type UpsellRow = { name: string; source: string; adds: number; conversions: number; conversionRate: number; revenue: number }
  const upsellMap = new Map<string, UpsellRow>()
  for (const a of upsellAddsData as any[]) {
    const key = `${a._id.name}::${a._id.source}`
    upsellMap.set(key, { name: a._id.name as string, source: a._id.source as string, adds: a.adds as number, conversions: 0, conversionRate: 0, revenue: 0 })
  }
  for (const c of upsellConversionsData as any[]) {
    const key = `${c._id.name}::${c._id.source}`
    const row = upsellMap.get(key)
    if (row) { row.conversions = c.conversions as number; row.revenue = c.revenue as number; row.conversionRate = row.adds > 0 ? Math.round((row.conversions / row.adds) * 100) : 0 }
    else { upsellMap.set(key, { name: c._id.name as string, source: c._id.source as string, adds: 0, conversions: c.conversions as number, conversionRate: 100, revenue: c.revenue as number }) }
  }
  const upsellRows = Array.from(upsellMap.values()).sort((a, b) => b.revenue - a.revenue)
  const upsellTotalAdds = upsellRows.reduce((s, r) => s + r.adds, 0)
  const upsellTotalConversions = upsellRows.reduce((s, r) => s + r.conversions, 0)
  const upsellTotalRevenue = upsellRows.reduce((s, r) => s + r.revenue, 0)
  const upsellOverallConvRate = upsellTotalAdds > 0 ? Math.round((upsellTotalConversions / upsellTotalAdds) * 100) : 0

  const stats = {
    revenue: thisMonth.total,
    orders: thisMonth.count,
    avgTicket: thisMonth.count > 0 ? Math.round(thisMonth.total / thisMonth.count) : 0,
    growth: revenueGrowth,
    lastMonthRevenue: lastMonth.total,
    lastMonthOrders: lastMonth.count,
    // Cancelación
    cancRate,
    cancTotal: cancRaw.total,
    cancCount: cancRaw.cancelled,
    cancRatePrev,
    cancTrend,
    // Distribución horaria
    hourlyDistribution,
    peakHour,
    // TPP
    tppMinutes,
    tppStdMin,
    tppSampleSize,
    // Pedidos en tiempo
    onTimePct,
    // Conversión MP
    payConvPct,
    // Recompra
    recompraPct,
    recompraClients: recompraRaw.totalClients,
    recompraBreakdown,
    // Nuevos KPIs Fase 1
    revenueByCategory,
    dailyTrend,
    revenueByLocation,
    // Upselling analytics
    upsellRows,
    upsellTotalAdds,
    upsellTotalConversions,
    upsellTotalRevenue,
    upsellOverallConvRate,
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-foreground text-4xl font-bold tracking-tight">Reportes</h1>
        <p className="text-muted-foreground mt-2 font-medium">Analiza el rendimiento y crecimiento de tu negocio.</p>
      </div>

      <ReportsDashboard
        stats={stats}
        topItems={JSON.parse(JSON.stringify(topItems))}
        recentOrders={JSON.parse(JSON.stringify(recentOrders))}
        tenantSlug={tenantSlug || ''}
        plan={plan}
      />
    </div>
  )
}
