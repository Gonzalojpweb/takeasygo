'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import PendingOrdersList from './PendingOrdersList'
import ActiveOrdersList from './ActiveOrdersList'
import CompletedOrdersList from './CompletedOrdersList'
import TabBar from './TabBar'
import DeliveryPushSetup from './DeliveryPushSetup'

type TabType = 'available' | 'active' | 'history'
type PageStep = 'loading' | 'error' | 'ready'

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
  createdAt?: string
}

export default function DeliveryInterface() {
  const params = useParams()
  const token = params?.token as string
  const tenant = params?.tenant as string

  const [step, setStep] = useState<PageStep>('loading')
  const [person, setPerson] = useState<Person | null>(null)
  const [tab, setTab] = useState<TabType>('available')
  const [availableOrders, setAvailableOrders] = useState<OrderSummary[]>([])
  const [activeOrders, setActiveOrders] = useState<OrderSummary[]>([])
  const [completedOrders, setCompletedOrders] = useState<OrderSummary[]>([])
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
      setAvailableOrders(data.availableOrders || [])
      setActiveOrders(data.activeOrders || [])
      setCompletedOrders(data.completedOrders || [])
      setStep('ready')

      // Default tab only on first load — never override user's choice on refresh
      if (initialLoad.current) {
        initialLoad.current = false
        if (data.activeOrders?.length > 0) {
          setTab('active')
        } else {
          setTab('available')
        }
      }

      setError('')
    } catch {
      setError('Error de conexión. Verificá tu internet.')
      setStep('ready')
    }
  }, [headers])

  const initialLoad = useRef(true)
  const redirectStored = useRef(false)

  useEffect(() => {
    if (!token) {
      setStep('error')
      setError('Link inválido')
      return
    }
    fetchOrders()
    if (!redirectStored.current) {
      redirectStored.current = true
      localStorage.setItem('deliveryRedirect', window.location.pathname)
    }
  }, [token, fetchOrders])

  // Tomar un pedido → mover de available a active, sin cambiar de tab
  const handleTakeOrder = (order: OrderSummary) => {
    setAvailableOrders(prev => prev.filter(o => o._id !== order._id))
    setActiveOrders(prev => [{
      ...order,
      deliveryConfirmation: { ...order.deliveryConfirmation, status: 'assigned' },
    }, ...prev])
  }

  const handleTakeAllOrders = (orders: OrderSummary[]) => {
    const takenIds = new Set(orders.map(o => o._id))
    setAvailableOrders(prev => prev.filter(o => !takenIds.has(o._id)))
    setActiveOrders(prev => [
      ...orders.map(o => ({
        ...o,
        deliveryConfirmation: { ...o.deliveryConfirmation, status: 'assigned' },
      })),
      ...prev,
    ])
  }

  // Delivery llegó → actualizar estado en active
  const handleArrived = (order: OrderSummary) => {
    setActiveOrders(prev =>
      prev.map(o =>
        o._id === order._id
          ? { ...order, deliveryConfirmation: { ...order.deliveryConfirmation, status: 'arrived' } }
          : o
      )
    )
  }

  // Entrega completada → mover de active a completed
  const handleCompleted = (orderId: string) => {
    const completed = activeOrders.find(o => o._id === orderId)
    if (completed) {
      setActiveOrders(prev => prev.filter(o => o._id !== orderId))
      setCompletedOrders(prev => [completed, ...prev])
    }
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

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-black">
            {person ? `👋 Hola, ${person.name}` : 'Delivery'}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {activeOrders.length > 0
              ? `${activeOrders.length} entrega${activeOrders.length !== 1 ? 's' : ''} activa${activeOrders.length !== 1 ? 's' : ''}`
              : `${availableOrders.length} pedido${availableOrders.length !== 1 ? 's' : ''} disponible${availableOrders.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Tabs */}
        <TabBar
          activeTab={tab}
          onTabChange={setTab}
          availableCount={availableOrders.length}
          activeCount={activeOrders.length}
          historyCount={completedOrders.length}
        />

        {/* Tab content */}
        {tab === 'available' && (
          <PendingOrdersList
            orders={availableOrders}
            token={token}
            onTakeOrder={handleTakeOrder}
            onTakeAll={handleTakeAllOrders}
          />
        )}

        {tab === 'active' && (
          <ActiveOrdersList
            orders={activeOrders}
            token={token}
            tenant={tenant}
            onArrived={handleArrived}
            onCompleted={handleCompleted}
          />
        )}

        {tab === 'history' && (
          <CompletedOrdersList orders={completedOrders} />
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

      <DeliveryPushSetup token={token} />
    </div>
  )
}
