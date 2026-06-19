'use client'

import { useState } from 'react'
import DeliveryArrivalButton from './DeliveryArrivalButton'
import DeliveryCodeInput from './DeliveryCodeInput'

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
}

interface Props {
  orders: OrderSummary[]
  token: string
  tenant: string
  onArrived: (orderId: string) => void
  onCompleted: (orderId: string) => void
}

const STATUS_LABEL: Record<string, { label: string; color: string; dot: string }> = {
  assigned: { label: 'En camino', color: 'text-amber-600 bg-amber-50 border-amber-200', dot: '🟡' },
  en_ruta: { label: 'En camino', color: 'text-amber-600 bg-amber-50 border-amber-200', dot: '🟡' },
  arrived: { label: 'Llegué', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', dot: '🟢' },
}

export default function ActiveOrdersList({ orders, token, tenant, onArrived, onCompleted }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (orders.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🚗</div>
        <h2 className="font-bold text-lg mb-1">Sin entregas activas</h2>
        <p className="text-sm text-zinc-400">Tocá &quot;Disponibles&quot; para tomar pedidos</p>
      </div>
    )
  }

  const statusInfo = (status: string) =>
    STATUS_LABEL[status] || { label: status, color: 'text-zinc-600 bg-zinc-50 border-zinc-200', dot: '⚪' }

  return (
    <div className="space-y-3">
      <h2 className="font-bold text-sm text-zinc-400 uppercase tracking-widest">
        Mis entregas ({orders.length})
      </h2>
      {orders.map(order => {
        const info = statusInfo(order.deliveryConfirmation?.status || order.status)
        const isExpanded = expandedId === order._id
        const isArrived = order.deliveryConfirmation?.status === 'arrived'

        return (
          <div
            key={order._id}
            className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden"
          >
            {/* Header (siempre visible) */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : order._id)}
              className="w-full text-left p-5 hover:bg-zinc-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-black text-lg"># {order.orderNumber}</span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${info.color}`}>
                  {info.dot} {info.label}
                </span>
              </div>
              <div className="mt-2 text-sm">
                <p className="font-semibold text-zinc-700">{order.customer.name}</p>
                <p className="text-zinc-500 mt-0.5">
                  📍 {order.deliveryAddress.street} {order.deliveryAddress.number}
                  {order.deliveryAddress.apt ? `, ${order.deliveryAddress.apt}` : ''}
                  , {order.deliveryAddress.city}
                </p>
              </div>
              <div className="mt-2 text-xs text-zinc-400 flex items-center gap-1">
                {isExpanded ? '▲' : '▼'} {isExpanded ? 'Cerrar' : 'Ver acción'}
              </div>
            </button>

            {/* Expanded actions */}
            {isExpanded && (
              <div className="px-5 pb-5 border-t border-zinc-100 pt-4">
                {isArrived ? (
                  <DeliveryCodeInput
                    orderId={order._id}
                    token={token}
                    tenant={tenant}
                    orderNumber={order.orderNumber}
                    onCompleted={() => onCompleted(order._id)}
                  />
                ) : (
                  <DeliveryArrivalButton
                    orderId={order._id}
                    token={token}
                    orderNumber={order.orderNumber}
                    deliveryAddress={order.deliveryAddress}
                    onArrived={() => {
                      setExpandedId(null)
                      onArrived(order._id)
                    }}
                  />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
