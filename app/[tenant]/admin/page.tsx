import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShoppingBag, Clock, CheckCircle, XCircle } from 'lucide-react'
import type { Types } from 'mongoose'

export default async function AdminDashboard() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .lean<{ _id: Types.ObjectId }>()
  if (!tenant) notFound()

  const tenantId = tenant._id

  const [total, pending, confirmed, cancelled] = await Promise.all([
    Order.countDocuments({ tenantId }),
    Order.countDocuments({ tenantId, status: 'pending' }),
    Order.countDocuments({ tenantId, status: 'confirmed' }),
    Order.countDocuments({ tenantId, status: 'cancelled' }),
  ])

  const recentOrders = await Order.find({ tenantId })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean()

  const stats = [
    { label: 'Total pedidos', value: total, icon: ShoppingBag, color: 'text-blue-400' },
    { label: 'Pendientes', value: pending, icon: Clock, color: 'text-yellow-400' },
    { label: 'Confirmados', value: confirmed, icon: CheckCircle, color: 'text-green-400' },
    { label: 'Cancelados', value: cancelled, icon: XCircle, color: 'text-red-400' },
  ]

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-8 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="bg-zinc-800 border-zinc-700">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-zinc-400 text-sm font-medium">{stat.label}</CardTitle>
                <Icon size={16} className={stat.color} />
              </CardHeader>
              <CardContent>
                <p className="text-white text-3xl font-bold">{stat.value}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Recent Orders */}
      <Card className="bg-zinc-800 border-zinc-700">
        <CardHeader>
          <CardTitle className="text-white text-base">Pedidos recientes</CardTitle>
        </CardHeader>
        <CardContent>
          {recentOrders.length === 0 ? (
            <p className="text-zinc-500 text-sm">No hay pedidos todavía</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order: any) => (
                <div key={order._id} className="flex items-center justify-between py-2 border-b border-zinc-700 last:border-0">
                  <div>
                    <p className="text-white text-sm font-medium">{order.orderNumber}</p>
                    <p className="text-zinc-400 text-xs">{order.customer.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white text-sm font-bold">${order.total.toLocaleString('es-AR')}</p>
                    <Badge variant="outline" className="text-xs mt-1 border-zinc-600 text-zinc-300">
                      {order.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}