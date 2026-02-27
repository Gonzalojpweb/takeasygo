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

  const [
    ordersThisMonth,
    ordersLastMonth,
    topItems,
    recentOrders,
  ] = await Promise.all([
    Order.aggregate([
      { $match: { tenantId: tenantId, createdAt: { $gte: startOfMonth }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
    ]),
    Order.aggregate([
      { $match: { tenantId: tenantId, createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
    ]),
    Order.aggregate([
      { $match: { tenantId: tenantId, status: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.name', total: { $sum: '$items.quantity' }, revenue: { $sum: '$items.subtotal' } } },
      { $sort: { total: -1 } },
      { $limit: 5 }
    ]),
    Order.find({ tenantId, status: { $ne: 'cancelled' } })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
  ])

  const thisMonth = ordersThisMonth[0] || { total: 0, count: 0 }
  const lastMonth = ordersLastMonth[0] || { total: 0, count: 0 }

  const revenueGrowth = lastMonth.total > 0
    ? (((thisMonth.total - lastMonth.total) / lastMonth.total) * 100).toFixed(1)
    : '0'

  const stats = {
    revenue: thisMonth.total,
    orders: thisMonth.count,
    avgTicket: thisMonth.count > 0 ? Math.round(thisMonth.total / thisMonth.count) : 0,
    growth: revenueGrowth,
    lastMonthRevenue: lastMonth.total,
    lastMonthOrders: lastMonth.count
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
