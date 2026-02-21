import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Location from '@/models/Location'
import { headers } from 'next/headers'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import OrderStatusButton from '@/components/admin/OrderStatusButton'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  confirmed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  preparing: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  ready: 'bg-green-500/20 text-green-400 border-green-500/30',
  delivered: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  ready: 'Listo',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

export default async function OrdersPage() {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const orders = await Order.find({ tenantId })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()

  const locations = await Location.find({ tenantId }).lean()
  const locationMap = Object.fromEntries(
    locations.map((l: any) => [l._id.toString(), l.name])
  )

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Pedidos</h1>

      {orders.length === 0 ? (
        <Card className="bg-zinc-800 border-zinc-700">
          <CardContent className="py-12 text-center">
            <p className="text-zinc-500">No hay pedidos todavía</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((order: any) => (
            <Card key={order._id} className="bg-zinc-800 border-zinc-700">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-white text-base">{order.orderNumber}</CardTitle>
                    <Badge className={STATUS_COLORS[order.status]}>
                      {STATUS_LABELS[order.status]}
                    </Badge>
                  </div>
                  <span className="text-zinc-400 text-xs">
                    {new Date(order.createdAt).toLocaleString('es-AR')}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-zinc-300 text-sm font-medium">{order.customer.name}</p>
                    {order.customer.phone && (
                      <p className="text-zinc-500 text-xs">{order.customer.phone}</p>
                    )}
                    <p className="text-zinc-500 text-xs mt-1">
                      {locationMap[order.locationId?.toString()] || 'Sede desconocida'}
                    </p>
                    <div className="mt-2 space-y-1">
                      {order.items.map((item: any) => (
                        <p key={item._id} className="text-zinc-400 text-xs">
                          {item.quantity}x {item.name} — ${item.subtotal.toLocaleString('es-AR')}
                        </p>
                      ))}
                    </div>
                    {order.notes && (
                      <p className="text-yellow-400 text-xs mt-2">📝 {order.notes}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-white font-bold">${order.total.toLocaleString('es-AR')}</p>
                    <OrderStatusButton
                      orderId={order._id.toString()}
                      currentStatus={order.status}
                      tenantSlug={tenantSlug || ''}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}