'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ShoppingBag, Clock, CheckCircle, XCircle, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react'
import BottomNav from '@/components/explore/BottomNav'
import { BlurFade } from '@/components/ui/blur-fade'

type OrderStatus = 'awaiting_payment' | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'

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

const statusConfig: Record<OrderStatus, { label: string; icon: any; color: string; bg: string }> = {
  awaiting_payment: { label: 'Esperando pago', icon: Clock, color: 'var(--tgo-state-discovery)', bg: 'var(--tgo-state-discovery-soft)' },
  pending: { label: 'Pendiente', icon: Clock, color: 'var(--tgo-state-discovery)', bg: 'var(--tgo-state-discovery-soft)' },
  confirmed: { label: 'Confirmado', icon: CheckCircle, color: 'var(--tgo-state-info)', bg: 'var(--tgo-state-info-soft)' },
  preparing: { label: 'Preparando', icon: Clock, color: 'var(--tgo-state-interactive)', bg: 'var(--tgo-state-interactive-soft)' },
  ready: { label: 'Listo', icon: CheckCircle, color: 'var(--tgo-state-success)', bg: 'var(--tgo-state-success-soft)' },
  delivered: { label: 'Entregado', icon: CheckCircle, color: 'var(--tgo-state-success)', bg: 'var(--tgo-state-success-soft)' },
  cancelled: { label: 'Cancelado', icon: XCircle, color: 'var(--tgo-state-danger)', bg: 'var(--tgo-state-danger-soft)' },
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
      const dest = window.location.pathname + window.location.search
      router.push(`/app/profile?callbackUrl=${encodeURIComponent(dest)}`)
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
      <div
        className="flex flex-col h-full items-center justify-center"
        style={{ backgroundColor: 'var(--tgo-surface-0)' }}
      >
        <Loader2 size={32} style={{ color: 'var(--tgo-state-interactive)' }} className="animate-spin" />
      </div>
    )
  }

  return (
    <div
      className="flex flex-col h-full overflow-y-auto pb-24"
      style={{ backgroundColor: 'var(--tgo-surface-0)' }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10"
        style={{
          backgroundColor: 'var(--tgo-surface-0)',
          borderBottom: '1px solid var(--tgo-border)',
        }}
      >
        <div className="flex items-center gap-4 p-4">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center"
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--tgo-radius-md)',
              backgroundColor: 'var(--tgo-surface-1)',
              color: 'var(--tgo-text-primary)',
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1
              style={{
                fontSize: 'var(--tgo-type-title)',
                fontWeight: 700,
                color: 'var(--tgo-text-primary)',
              }}
            >
              Mis Pedidos
            </h1>
            <p
              style={{
                fontSize: 'var(--tgo-type-caption)',
                color: 'var(--tgo-text-muted)',
              }}
            >
              Historial de compras
            </p>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="flex-1 p-4 space-y-3">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div
              className="flex items-center justify-center mb-4"
              style={{
                width: 80,
                height: 80,
                borderRadius: 'var(--tgo-radius-xl)',
                backgroundColor: 'var(--tgo-surface-1)',
              }}
            >
              <ShoppingBag size={32} style={{ color: 'var(--tgo-text-muted)' }} />
            </div>
            <p
              style={{
                color: 'var(--tgo-text-primary)',
                fontWeight: 500,
                marginBottom: 4,
              }}
            >
              No tenés pedidos aún
            </p>
            <p
              style={{
                fontSize: 'var(--tgo-type-body-sm)',
                color: 'var(--tgo-text-muted)',
                textAlign: 'center',
                maxWidth: 200,
              }}
            >
              Explorá restaurantes y realizá tu primer pedido
            </p>
          </div>
        ) : (
          <>
            {orders.map((order, index) => {
              const cfg = statusConfig[order.status]
              const StatusIcon = cfg.icon
              return (
                <BlurFade key={order.id} delay={index * 0.05}>
                  <button
                    onClick={() => handleOrderClick(order)}
                    className="w-full flex items-center gap-4 group text-left"
                    style={{
                      padding: 'var(--tgo-card-padding)',
                      borderRadius: 'var(--tgo-radius-xl)',
                      backgroundColor: 'var(--tgo-surface-card)',
                      border: '1px solid var(--tgo-border)',
                      boxShadow: 'var(--tgo-elevation-card)',
                      transition: 'all var(--tgo-duration-fast) var(--tgo-ease-standard)',
                    }}
                  >
                    {/* Restaurant Logo */}
                    <div
                      className="relative shrink-0 overflow-hidden"
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 'var(--tgo-radius-md)',
                        border: '1px solid var(--tgo-border)',
                      }}
                    >
                      {order.tenant?.logoUrl ? (
                        <Image
                          src={order.tenant.logoUrl}
                          alt={order.tenant.name}
                          width={56}
                          height={56}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center"
                          style={{ backgroundColor: 'var(--tgo-surface-1)' }}
                        >
                          <ShoppingBag size={20} style={{ color: 'var(--tgo-text-muted)' }} />
                        </div>
                      )}
                    </div>

                    {/* Order Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p
                          className="truncate"
                          style={{
                            fontSize: 'var(--tgo-type-body-sm)',
                            fontWeight: 600,
                            color: 'var(--tgo-text-primary)',
                          }}
                        >
                          {order.tenant?.name || 'Restaurante'}
                        </p>
                        <StatusIcon size={16} style={{ color: cfg.color }} />
                      </div>
                      <p
                        style={{
                          fontSize: 'var(--tgo-type-caption)',
                          color: 'var(--tgo-text-muted)',
                          marginBottom: 4,
                        }}
                      >
                        #{order.orderNumber} • {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
                      </p>
                      <div className="flex items-center gap-2">
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: 'var(--tgo-tracking-wider)',
                            color: cfg.color,
                          }}
                        >
                          {cfg.label}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            color: 'var(--tgo-text-muted)',
                          }}
                        >
                          ${order.total.toLocaleString('es-AR')}
                        </span>
                      </div>
                    </div>

                    {/* Chevron */}
                    {order.trackingUrl && (
                      <ChevronRight
                        size={16}
                        className="shrink-0"
                        style={{ color: 'var(--tgo-text-muted)' }}
                      />
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
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--tgo-radius-md)',
                    backgroundColor: 'var(--tgo-surface-1)',
                    color: 'var(--tgo-text-primary)',
                    fontSize: 'var(--tgo-type-body-sm)',
                    fontWeight: 600,
                    opacity: page === 1 ? 0.4 : 1,
                    cursor: page === 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Anterior
                </button>
                <span
                  style={{
                    fontSize: 'var(--tgo-type-body-sm)',
                    color: 'var(--tgo-text-muted)',
                  }}
                >
                  {page} de {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--tgo-radius-md)',
                    backgroundColor: 'var(--tgo-surface-1)',
                    color: 'var(--tgo-text-primary)',
                    fontSize: 'var(--tgo-type-body-sm)',
                    fontWeight: 600,
                    opacity: page === totalPages ? 0.4 : 1,
                    cursor: page === totalPages ? 'not-allowed' : 'pointer',
                  }}
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
