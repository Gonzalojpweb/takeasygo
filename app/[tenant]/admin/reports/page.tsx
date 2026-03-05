import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import ReportsDashboard from '@/components/admin/ReportsDashboard'

export default async function ReportsPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean<{ _id: import('mongoose').Types.ObjectId }>()
  if (!tenant) notFound()

  const tenantId = tenant._id

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
  const last7days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [
    ordersThisMonth,
    ordersLastMonth,
    topItems,
    recentOrders,
    cancellationData,
    peakHoursData,
    tppData,
    onTimeData,
    paymentData,
    recompraData,
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
    // Hora pico — top 3 franjas horarias por volumen (mes actual)
    Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: startOfMonth }, status: { $ne: 'cancelled' } } },
      { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 3 }
    ]),
    // TPP (Tiempo Promedio de Preparación) — órdenes con confirmedAt y readyAt
    Order.aggregate([
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
    ]),
    // % pedidos en tiempo — readyAt - createdAt vs estimatedPickupTime de la location
    Order.aggregate([
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
      { $unwind: { path: '$location', preserveNullAndEmpty: false } },
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
    ]),
    // Conversión de pagos MP del mes
    Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: startOfMonth }, 'payment.method': 'mercadopago' } },
      { $group: {
        _id: null,
        total: { $sum: 1 },
        approved: { $sum: { $cond: [{ $eq: ['$payment.status', 'approved'] }, 1, 0] } }
      }}
    ]),
    // Tasa de recompra — clientes únicos por teléfono con más de 1 orden
    Order.aggregate([
      { $match: { tenantId, 'customer.phone': { $ne: '' } } },
      { $group: { _id: '$customer.phone', count: { $sum: 1 } } },
      { $group: {
        _id: null,
        totalClients: { $sum: 1 },
        recurring: { $sum: { $cond: [{ $gt: ['$count', 1] }, 1, 0] } }
      }}
    ]),
  ])

  const thisMonth = ordersThisMonth[0] || { total: 0, count: 0 }
  const lastMonth = ordersLastMonth[0] || { total: 0, count: 0 }

  const revenueGrowth = lastMonth.total > 0
    ? (((thisMonth.total - lastMonth.total) / lastMonth.total) * 100).toFixed(1)
    : '0'

  // Cancelación
  const cancRaw = cancellationData[0] || { total: 0, cancelled: 0 }
  const cancRate = cancRaw.total > 0 ? Math.round((cancRaw.cancelled / cancRaw.total) * 100) : 0

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

  // Recompra
  const recompraRaw = recompraData[0] || { totalClients: 0, recurring: 0 }
  const recompraPct = recompraRaw.totalClients > 0
    ? Math.round((recompraRaw.recurring / recompraRaw.totalClients) * 100)
    : null

  const stats = {
    revenue: thisMonth.total,
    orders: thisMonth.count,
    avgTicket: thisMonth.count > 0 ? Math.round(thisMonth.total / thisMonth.count) : 0,
    growth: revenueGrowth,
    lastMonthRevenue: lastMonth.total,
    lastMonthOrders: lastMonth.count,
    // Nuevos KPIs operativos
    cancRate,
    cancTotal: cancRaw.total,
    cancCount: cancRaw.cancelled,
    peakHours: peakHoursData.map((h: any) => ({ hour: h._id, count: h.count })),
    tppMinutes,
    tppStdMin,
    tppSampleSize,
    onTimePct,
    payConvPct,
    recompraPct,
    recompraClients: recompraRaw.totalClients,
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
      />
    </div>
  )
}
