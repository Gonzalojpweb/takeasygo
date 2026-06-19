'use client'

interface OrderSummary {
  _id: string
  orderNumber: string
  status: string
  deliveryAddress: {
    street: string
    number: string
    apt?: string
    city: string
  }
  customer: { name: string }
  deliveryConfirmation: {
    status: string
    customerCode?: { code: string }
  }
  createdAt?: string
}

interface Props {
  orders: OrderSummary[]
}

function formatTime(dateStr?: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export default function CompletedOrdersList({ orders }: Props) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">📋</div>
        <h2 className="font-bold text-lg mb-1">Sin entregas hoy</h2>
        <p className="text-sm text-zinc-400">Aún no completaste ninguna entrega</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h2 className="font-bold text-sm text-zinc-400 uppercase tracking-widest">
        Entregas completadas ({orders.length})
      </h2>
      {orders.map(order => (
        <div
          key={order._id}
          className="bg-white rounded-2xl border border-zinc-100 p-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-lg flex-shrink-0">✅</span>
              <div className="min-w-0">
                <span className="font-bold text-sm block truncate"># {order.orderNumber}</span>
                <p className="text-xs text-zinc-500 mt-0.5 truncate">
                  {order.customer.name}
                </p>
              </div>
            </div>
            <span className="text-xs text-zinc-400 flex-shrink-0">
              {formatTime(order.createdAt)}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-2 pl-8 break-words">
            📍 {order.deliveryAddress.street} {order.deliveryAddress.number}
            {order.deliveryAddress.apt ? `, ${order.deliveryAddress.apt}` : ''}
          </p>
        </div>
      ))}
    </div>
  )
}
