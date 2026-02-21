import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import { headers } from 'next/headers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, ShoppingBag, DollarSign, Users } from 'lucide-react'
import mongoose from 'mongoose'

export default async function ReportsPage() {
  const headersList = await headers()
  const tenantIdStr = headersList.get('x-tenant-id')

  await connectDB()

  const tenantId = new mongoose.Types.ObjectId(tenantIdStr!)

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

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Reportes</h1>

      {/* Stats del mes */}
      <div className="grid grid-cols-2 gap-4 mb-8 lg:grid-cols-4">
        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-zinc-400 text-sm font-medium">Ventas del mes</CardTitle>
            <DollarSign size={16} className="text-green-400" />
          </CardHeader>
          <CardContent>
            <p className="text-white text-2xl font-bold">${thisMonth.total.toLocaleString('es-AR')}</p>
            <p className={`text-xs mt-1 ${Number(revenueGrowth) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {Number(revenueGrowth) >= 0 ? '+' : ''}{revenueGrowth}% vs mes anterior
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-zinc-400 text-sm font-medium">Pedidos del mes</CardTitle>
            <ShoppingBag size={16} className="text-blue-400" />
          </CardHeader>
          <CardContent>
            <p className="text-white text-2xl font-bold">{thisMonth.count}</p>
            <p className="text-zinc-500 text-xs mt-1">
              {lastMonth.count} el mes pasado
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-zinc-400 text-sm font-medium">Ticket promedio</CardTitle>
            <TrendingUp size={16} className="text-yellow-400" />
          </CardHeader>
          <CardContent>
            <p className="text-white text-2xl font-bold">
              ${thisMonth.count > 0 ? Math.round(thisMonth.total / thisMonth.count).toLocaleString('es-AR') : 0}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-zinc-400 text-sm font-medium">Mes anterior</CardTitle>
            <Users size={16} className="text-purple-400" />
          </CardHeader>
          <CardContent>
            <p className="text-white text-2xl font-bold">${lastMonth.total.toLocaleString('es-AR')}</p>
            <p className="text-zinc-500 text-xs mt-1">{lastMonth.count} pedidos</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top items */}
        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader>
            <CardTitle className="text-white text-base">Items más vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            {topItems.length === 0 ? (
              <p className="text-zinc-500 text-sm">Sin datos todavía</p>
            ) : (
              <div className="space-y-3">
                {topItems.map((item: any, index: number) => (
                  <div key={item._id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-zinc-600 text-sm w-5">{index + 1}.</span>
                      <span className="text-white text-sm">{item._id}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-white text-sm font-bold">{item.total} vendidos</p>
                      <p className="text-zinc-500 text-xs">${item.revenue.toLocaleString('es-AR')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Últimos pedidos */}
        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader>
            <CardTitle className="text-white text-base">Últimos pedidos</CardTitle>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <p className="text-zinc-500 text-sm">Sin pedidos todavía</p>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((order: any) => (
                  <div key={order._id} className="flex items-center justify-between py-1">
                    <div>
                      <p className="text-white text-sm font-medium">{order.orderNumber}</p>
                      <p className="text-zinc-500 text-xs">{order.customer.name}</p>
                    </div>
                    <p className="text-white text-sm font-bold">
                      ${order.total.toLocaleString('es-AR')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}