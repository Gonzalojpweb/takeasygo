'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ShoppingBag, Clock, CheckCircle, XCircle, AlertCircle, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react'
import BottomNav from '@/components/explore/BottomNav'
import { BlurFade } from '@/components/ui/blur-fade'

type OrderStatus = 'awaiting_payment' | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'

interface OrderItem {
  name: string
  quantity: number
}

interface Order {
  id: string
  orderNumber: string
  status: OrderStatus
  total: number
  orderMode: 'takeaway' | 'dine-in'
  createdAt: string
  paymentStatus: string
  itemCount: number
  firstItemName: string
  tenant: {
    name: string
    slug: string
    logoUrl: string
    primaryColor: string
  } | null
  trackingUrl: string | null
}

interface OrdersResponse {
  orders: Order[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

const statusConfig: Record<OrderStatus, { label: string; icon: any; color: string }> = {
  awaiting_payment: { label: 'Esperando pago', icon: Clock, color: 'text-amber-500' },
  pending: { label: 'Pendiente', icon: Clock, color: 'text-amber-500' },
  confirmed: { label: 'Confirmado', icon: CheckCircle, color: 'text-blue-500' },
  preparing: { label: 'Preparando', icon: Clock, color: 'text-purple-500' },
  ready: { label: 'Listo', icon: CheckCircle, color: 'text-emerald-500' },
  delivered: { label: 'Entregado', icon: CheckCircle, color: 'text-emerald-500' },
  cancelled: { label: 'Cancelado', icon: XCircle, color: 'text-red-500' },
}

export default function OrdersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(`/app/profile?callbackUrl=${encodeURIComponent(window.location.href)}`)
      return
    }

    if (status === 'authenticated') {
      fetchOrders()
    }
  }, [status, page])

  const fetchOrders = async () => {
    try {
      const res = await fetch(`/api/explore/orders?page=${page}`)
      if (!res.ok) throw new Error('Error al cargar pedidos')
      const data: OrdersResponse = await res.json()
      setOrders(data.orders)
      setTotalPages(data.pagination.pages)
    } catch (error) {
      console.error('Error fetching orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOrderClick = (order: Order) => {
    if (order.trackingUrl) {
      router.push(order.trackingUrl)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full bg-[var(--c-bg)] items-center justify-center">
        <Loader2 size={32} className="text-[#f14722] animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] consumer-dark overflow-y-auto pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 glass-card border-b border-[var(--c-border)]">
        <div className="flex items-center gap-4 p-4">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-xl bg-[var(--c-surface)] flex items-center justify-center text-[#f7f4f2] hover:bg-[var(--c-border)] transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-[#f7f4f2]">Mis Pedidos</h1>
            <p className="text-xs text-[#5a524d]">Historial de compras</p>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="flex-1 p-4 space-y-3">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-20 h-20 rounded-full bg-[var(--c-surface)] flex items-center justify-center mb-4">
              <ShoppingBag size={32} className="text-[#5a524d]" />
            </div>
            <p className="text-[#f7f4f2] font-medium mb-1">No tienes pedidos aún</p>
            <p className="text-sm text-[#5a524d] text-center max-w-[200px]">
              Explora restaurantes y realiza tu primer pedido
            </p>
          </div>
        ) : (
          <>
            {orders.map((order, index) => {
              const StatusIcon = statusConfig[order.status].icon
              return (
                <BlurFade key={order.id} delay={index * 0.05}>
                  <button
                    onClick={() => handleOrderClick(order)}
                    className="w-full glass-card rounded-2xl p-4 flex items-center gap-4 group hover:border-[var(--c-border-active)] transition-all text-left"
                  >
                    {/* Restaurant Logo */}
                    <div className="w-14 h-14 rounded-xl overflow-hidden border border-[var(--c-border)] shrink-0">
                      {order.tenant?.logoUrl ? (
                        <Image
                          src={order.tenant.logoUrl}
                          alt={order.tenant.name}
                          width={56}
                          height={56}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-[var(--c-surface)] flex items-center justify-center">
                          <ShoppingBag size={20} className="text-[#5a524d]" />
                        </div>
                      )}
                    </div>

                    {/* Order Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-bold text-[#f7f4f2] truncate">
                          {order.tenant?.name || 'Restaurante'}
                        </p>
                        <StatusIcon size={16} className={statusConfig[order.status].color} />
                      </div>
                      <p className="text-xs text-[#5a524d] mb-1">
                        #{order.orderNumber} • {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${statusConfig[order.status].color}`}>
                          {statusConfig[order.status].label}
                        </span>
                        <span className="text-[10px] text-[#5a524d]">
                          ${order.total.toLocaleString('es-AR')}
                        </span>
                      </div>
                    </div>

                    {/* Chevron */}
                    {order.trackingUrl && (
                      <ChevronRight size={16} className="text-[#5a524d] group-hover:translate-x-1 transition-transform shrink-0" />
                    )}
                  </button>
                </BlurFade>
              )
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 rounded-xl bg-[var(--c-surface)] text-[#f7f4f2] text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--c-border)] transition-colors"
                >
                  Anterior
                </button>
                <span className="text-sm text-[#5a524d]">
                  {page} de {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 rounded-xl bg-[var(--c-surface)] text-[#f7f4f2] text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--c-border)] transition-colors"
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
