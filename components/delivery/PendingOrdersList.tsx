'use client'

import { useState } from 'react'

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
}

interface Props {
  orders: OrderSummary[]
  token: string
  onTakeOrder: (order: OrderSummary) => void
}

export default function PendingOrdersList({ orders, token, onTakeOrder }: Props) {
  const [takingId, setTakingId] = useState<string | null>(null)

  const pendingOrders = orders.filter(o => o.deliveryConfirmation?.status === 'pending')

  if (pendingOrders.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">📭</div>
        <h2 className="font-bold text-lg mb-1">Sin pedidos pendientes</h2>
        <p className="text-sm text-zinc-400">No hay pedidos listos para delivery en este momento</p>
      </div>
    )
  }

  async function handleTake(order: OrderSummary) {
    setTakingId(order._id)
    try {
      const res = await fetch(`/api/delivery/${order._id}/take`, {
        method: 'POST',
        headers: { 'x-delivery-token': token },
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al tomar pedido')
      }
      onTakeOrder(order)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setTakingId(null)
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="font-bold text-sm text-zinc-400 uppercase tracking-widest">
        Pedidos listos para entregar
      </h2>
      {pendingOrders.map(order => (
        <div
          key={order._id}
          className="bg-white rounded-2xl border border-zinc-200 p-5 space-y-3 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="font-black text-lg"># {order.orderNumber}</span>
            <span className="text-xs px-2 py-1 bg-emerald-50 text-emerald-600 rounded-full font-bold border border-emerald-200">
              Listo
            </span>
          </div>

          <div className="text-sm">
            <p className="font-semibold text-zinc-700">{order.customer.name}</p>
            <p className="text-zinc-500 mt-1">
              📍 {order.deliveryAddress.street} {order.deliveryAddress.number}
              {order.deliveryAddress.apt ? `, ${order.deliveryAddress.apt}` : ''}
              , {order.deliveryAddress.city}
            </p>
          </div>

          <button
            onClick={() => handleTake(order)}
            disabled={takingId === order._id}
            className="w-full py-3 rounded-xl bg-zinc-800 text-white font-bold text-sm hover:bg-zinc-700 transition-all disabled:opacity-50"
          >
            {takingId === order._id ? 'Tomando...' : '📦 Tomar pedido'}
          </button>
        </div>
      ))}
    </div>
  )
}
