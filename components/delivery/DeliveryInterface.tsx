'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import PendingOrdersList from './PendingOrdersList'
import DeliveryArrivalButton from './DeliveryArrivalButton'
import DeliveryCodeInput from './DeliveryCodeInput'

type Step = 'loading' | 'error' | 'orders' | 'arrived' | 'completed'

interface Person {
  _id: string
  name: string
  phone: string
}

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

export default function DeliveryInterface() {
  const params = useParams()
  const token = params?.token as string
  const tenant = params?.tenant as string

  const [step, setStep] = useState<Step>('loading')
  const [person, setPerson] = useState<Person | null>(null)
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [activeOrder, setActiveOrder] = useState<OrderSummary | null>(null)
  const [error, setError] = useState('')

  const headers = { 'x-delivery-token': token }

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/delivery/me`, { headers })
      if (!res.ok) {
        if (res.status === 401 || res.status === 404) {
          setStep('error')
          setError('Link inválido o delivery desactivado. Contactá al restaurante.')
          return
        }
        throw new Error('Error al cargar')
      }
      const data = await res.json()
      setPerson(data.person)

      if (data.pendingOrders?.length > 0) {
        const active = data.pendingOrders.find(
          (o: any) => o.deliveryConfirmation?.status !== 'pending'
        )
        if (active) {
          setActiveOrder(active)
          if (active.status === 'arrived' || active.deliveryConfirmation?.status === 'arrived') {
            setStep('arrived')
          } else {
            setStep('orders')
          }
        } else {
          setActiveOrder(null)
          setStep('orders')
        }
      } else {
        setActiveOrder(null)
        setStep('orders')
      }
      setOrders(data.pendingOrders)
      setError('')
    } catch {
      setError('Error de conexión. Verificá tu internet.')
    }
  }, [headers])

  useEffect(() => {
    if (!token) {
      setStep('error')
      setError('Link inválido')
      return
    }
    fetchOrders()
  }, [token, fetchOrders])

  const handleTakeOrder = (order: OrderSummary) => {
    setActiveOrder(order)
    setStep('orders')
    fetchOrders()
  }

  const handleArrived = (order: OrderSummary) => {
    setActiveOrder(order)
    setStep('arrived')
    fetchOrders()
  }

  const handleCompleted = () => {
    setStep('completed')
    setActiveOrder(null)
    setTimeout(() => {
      setStep('orders')
      fetchOrders()
    }, 3000)
  }

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-zinc-300 border-t-zinc-800 rounded-full mx-auto mb-4" />
          <p className="text-sm text-zinc-500 font-medium">Cargando...</p>
        </div>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
        <div className="max-w-sm text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-xl font-black mb-2">Error de acceso</h1>
          <p className="text-sm text-zinc-500 mb-6">{error}</p>
          <button
            onClick={fetchOrders}
            className="px-6 py-3 bg-zinc-800 text-white rounded-xl font-bold text-sm hover:bg-zinc-700 transition-all"
          >
            Intentar de nuevo
          </button>
        </div>
      </div>
    )
  }

  if (step === 'completed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emerald-50 p-4">
        <div className="max-w-sm text-center">
          <div className="text-7xl mb-4 animate-bounce">✅</div>
          <h1 className="text-2xl font-black text-emerald-800 mb-2">¡Entrega completada!</h1>
          <p className="text-sm text-emerald-600">Pedido entregado con éxito</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-black">
            {person ? `👋 Hola, ${person.name}` : 'Delivery'}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {activeOrder ? 'Tenés un pedido activo' : `${orders.length} pedido${orders.length !== 1 ? 's' : ''} pendiente${orders.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Active order in progress */}
        {activeOrder && activeOrder.deliveryConfirmation?.status === 'arrived' && (
          <DeliveryCodeInput
            orderId={activeOrder._id}
            token={token}
            tenant={tenant}
            orderNumber={activeOrder.orderNumber}
            onCompleted={handleCompleted}
          />
        )}

        {activeOrder && activeOrder.deliveryConfirmation?.status === 'assigned' && (
          <DeliveryArrivalButton
            orderId={activeOrder._id}
            token={token}
            orderNumber={activeOrder.orderNumber}
            deliveryAddress={activeOrder.deliveryAddress}
            onArrived={handleArrived}
          />
        )}

        {/* Pending orders list */}
        {!activeOrder && (
          <PendingOrdersList
            orders={orders}
            token={token}
            onTakeOrder={handleTakeOrder}
          />
        )}

        {/* Bottom refresh */}
        <div className="mt-8 text-center">
          <button
            onClick={fetchOrders}
            className="text-xs text-zinc-400 hover:text-zinc-600 font-medium transition-colors"
          >
            ↻ Actualizar pedidos
          </button>
        </div>
      </div>
    </div>
  )
}
