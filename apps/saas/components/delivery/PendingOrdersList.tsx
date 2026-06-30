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
  deliveryConfirmation: {
    status: string
    customerCode?: { code: string }
  }
}

interface Props {
  orders: OrderSummary[]
  token: string
  onTakeOrder: (order: OrderSummary) => void
  onTakeAll?: (orders: OrderSummary[]) => void
}

export default function PendingOrdersList({ orders, token, onTakeOrder, onTakeAll }: Props) {
  const [takingId, setTakingId] = useState<string | null>(null)
  const [takingAll, setTakingAll] = useState(false)

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

  async function handleTakeAll() {
    if (!onTakeAll) return
    setTakingAll(true)
    const taken: OrderSummary[] = []
    for (const order of pendingOrders) {
      try {
        const res = await fetch(`/api/delivery/${order._id}/take`, {
          method: 'POST',
          headers: { 'x-delivery-token': token },
        })
        if (res.ok) {
          taken.push(order)
        }
      } catch {
        // individual failure, continue with others
      }
    }
    if (taken.length > 0) {
      onTakeAll(taken)
    }
    setTakingAll(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-sm text-zinc-400 uppercase tracking-widest">
          Pedidos listos
        </h2>
        {pendingOrders.length > 1 && onTakeAll && (
          <button
            onClick={handleTakeAll}
            disabled={takingAll}
            className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-all disabled:opacity-50"
          >
            {takingAll ? 'Tomando...' : `Tomar todos (${pendingOrders.length})`}
          </button>
        )}
      </div>
      {pendingOrders.map(order => (
        <div
          key={order._id}
          className="bg-white rounded-2xl border border-zinc-200 p-5 space-y-3 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-black text-lg leading-tight"># {order.orderNumber}</span>
            <span className="text-xs px-2 py-1 bg-emerald-50 text-emerald-600 rounded-full font-bold border border-emerald-200 flex-shrink-0">
              Listo
            </span>
          </div>

          <div className="text-sm">
            <p className="font-semibold text-zinc-700">{order.customer.name}</p>
            <p className="text-zinc-500 mt-1 break-words">
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
