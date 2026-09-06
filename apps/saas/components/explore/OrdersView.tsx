'use client'

import { useState, useEffect } from 'react'
import { toPesos } from '@takeasygo/business'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Package, ChevronRight, Clock, CheckCircle2, XCircle, Loader2, ShoppingBag, AlertCircle, ArrowRight, LogIn } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { BlurFade } from '@/components/ui/blur-fade'
import { EmptyState } from '@/components/tgo'
import { useHaptic } from '@/components/tgo/useHaptic'
import PuntoTGO from '@/components/tgo/PuntoTGO'

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  awaiting_payment: { label: 'Esperando pago', color: 'var(--tgo-state-warning)', bg: 'var(--tgo-state-warning-soft)', icon: <Clock size={11} /> },
  pending:          { label: 'Recibido',        color: 'var(--tgo-state-info)', bg: 'var(--tgo-state-info-soft)', icon: <Clock size={11} /> },
  confirmed:        { label: 'Confirmado',      color: 'var(--tgo-state-info)', bg: 'var(--tgo-state-info-soft)', icon: <CheckCircle2 size={11} /> },
  preparing:        { label: 'Preparando',      color: 'var(--tgo-state-warning)', bg: 'var(--tgo-state-warning-soft)', icon: <Loader2 size={11} className="animate-spin" /> },
  ready:            { label: '¡Listo!',         color: 'var(--tgo-state-activity)', bg: 'var(--tgo-state-activity-soft)', icon: <CheckCircle2 size={11} /> },
  delivered:        { label: 'Entregado',       color: 'var(--tgo-text-muted)', bg: 'var(--tgo-surface-1)', icon: <CheckCircle2 size={11} /> },
  cancelled:        { label: 'Cancelado',       color: 'var(--tgo-state-danger)', bg: 'var(--tgo-state-danger-soft)', icon: <XCircle size={11} /> },
}

interface OrderItem {
  id: string
  orderNumber: string
  status: string
  total: number
  orderMode: string
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

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffDays === 0) return 'Hoy ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Ayer ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export default function OrdersView() {
  const haptic = useHaptic()
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const [orders, setOrders] = useState<OrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    if (authStatus === 'loading') return
    if (authStatus === 'unauthenticated') {
      setLoading(false)
      return
    }
    fetchOrders(1)
  }, [authStatus])

  const fetchOrders = async (p: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/explore/orders?page=${p}`)
      if (!res.ok) throw new Error('Error')
      const data = await res.json()
      setOrders(prev => p === 1 ? data.orders : [...prev, ...data.orders])
      setTotalPages(data.pagination.pages)
      setPage(p)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  // Unauthenticated state
  if (authStatus === 'unauthenticated') {
    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--tgo-surface-0)' }}>
        {/* Header */}
        <div className="px-5 pt-12 pb-4">
          <h1 className="font-extrabold text-[22px]" style={{ color: 'var(--tgo-text-primary)' }}>Tus pedidos</h1>
        </div>

        {/* Empty state */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 pb-24">
          <PuntoTGO expression="sleepy" size="xl" animate={false} />

          <h2
            className="font-extrabold text-base mt-6 mb-2 text-center"
            style={{ color: 'var(--tgo-text-primary)' }}
          >
            Todavía no hay nada acá
          </h2>
          <p
            className="text-[13px] text-center leading-relaxed mb-8 max-w-[260px]"
            style={{ color: 'var(--tgo-text-muted)' }}
          >
            Cuando hagas tu primer pedido en la red, vas a poder seguirlo en tiempo real desde esta pantalla.
          </p>

          <button
            onClick={() => { haptic.impact('light'); router.push('/login?callbackUrl=/app') }}
            className="px-8 py-3 rounded-full font-bold text-sm transition-all active:scale-[0.97]"
            style={{
              backgroundColor: 'var(--tgo-brand)',
              color: 'var(--tgo-text-inverse)',
            }}
          >
            Iniciar sesión
          </button>
        </div>
      </div>
    )
  }

  // Loading state
  if (loading && orders.length === 0) {
    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--tgo-surface-0)' }}>
        {/* Header */}
        <div className="px-5 pt-12 pb-4">
          <h1 className="font-extrabold text-[22px]" style={{ color: 'var(--tgo-text-primary)' }}>Tus pedidos</h1>
        </div>
        <div className="p-5 space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--tgo-surface-1)' }} />
          ))}
        </div>
      </div>
    )
  }

  // Empty state
  if (!loading && orders.length === 0) {
    const userInitial = session?.user?.name?.[0]?.toUpperCase() ?? session?.user?.email?.[0]?.toUpperCase() ?? '?'

    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--tgo-surface-0)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-12 pb-4">
          <h1 className="font-extrabold text-[22px]" style={{ color: 'var(--tgo-text-primary)' }}>Tus pedidos</h1>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm"
            style={{
              backgroundColor: 'var(--tgo-brand)',
              color: 'var(--tgo-text-inverse)',
            }}
          >
            {userInitial}
          </div>
        </div>

        {/* Empty state */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 pb-24">
          <PuntoTGO expression="sleepy" size="xl" animate={false} />

          <h2
            className="font-extrabold text-base mt-6 mb-2 text-center"
            style={{ color: 'var(--tgo-text-primary)' }}
          >
            Todavía no hay nada acá
          </h2>
          <p
            className="text-[13px] text-center leading-relaxed mb-8 max-w-[260px]"
            style={{ color: 'var(--tgo-text-muted)' }}
          >
            Cuando hagas tu primer pedido en la red, vas a poder seguirlo en tiempo real desde esta pantalla.
          </p>

          <button
            onClick={() => { haptic.impact('light'); router.push('/app') }}
            className="px-8 py-3 rounded-full font-bold text-sm transition-all active:scale-[0.97]"
            style={{
              backgroundColor: 'var(--tgo-brand)',
              color: 'var(--tgo-text-inverse)',
            }}
          >
            Explorar cerca tuyo
          </button>
        </div>
      </div>
    )
  }

  const userInitial = session?.user?.name?.[0]?.toUpperCase() ?? session?.user?.email?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-24" style={{ backgroundColor: 'var(--tgo-surface-0)' }}>
      {/* Header */}
      <div className="sticky top-0 backdrop-blur-xl px-5 pt-12 pb-4 z-10" style={{ backgroundColor: 'color-mix(in srgb, var(--tgo-surface-0) 90%, transparent)', borderBottom: '1px solid var(--tgo-border)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-extrabold text-[22px]" style={{ color: 'var(--tgo-text-primary)' }}>Tus pedidos</h1>
            <p className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--tgo-text-muted)' }}>{orders.length} pedido{orders.length !== 1 ? 's' : ''}</p>
          </div>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm"
            style={{
              backgroundColor: 'var(--tgo-brand)',
              color: 'var(--tgo-text-inverse)',
            }}
          >
            {userInitial}
          </div>
        </div>
      </div>

      {/* Orders list */}
      <div className="p-5 space-y-3">
        <AnimatePresence>
          {orders.map((order, i) => {
            const badge = STATUS_BADGE[order.status] ?? STATUS_BADGE.pending
            const isActive = !['delivered', 'cancelled'].includes(order.status)

            return (
              <BlurFade key={order.id} delay={i * 0.04} inView>
                <motion.div
                  layout
                  onClick={() => order.trackingUrl && router.push(order.trackingUrl)}
                  className={`relative flex items-center gap-3 p-4 rounded-2xl transition-all active:scale-[0.99] ${
                    isActive
                      ? 'border-2 cursor-pointer shadow-sm'
                      : 'border cursor-pointer'
                  }`}
                  style={{
                    backgroundColor: 'var(--tgo-card)',
                    borderColor: isActive ? order.tenant?.primaryColor + '40' : 'var(--tgo-border)',
                  }}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <div
                      className="absolute top-3 right-3 w-2 h-2 rounded-full animate-pulse"
                      style={{ backgroundColor: order.tenant?.primaryColor ?? 'var(--tgo-brand)' }}
                    />
                  )}

                  {/* Logo */}
                  <div className="shrink-0 w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center" style={{ backgroundColor: 'var(--tgo-surface-1)', border: '1px solid var(--tgo-border)' }}>
                    {order.tenant?.logoUrl ? (
                      <img src={order.tenant.logoUrl} alt={order.tenant.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package size={20} style={{ color: 'var(--tgo-text-muted)' }} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-sm truncate" style={{ color: 'var(--tgo-text-primary)' }}>
                        {order.tenant?.name ?? 'Restaurante'}
                      </h3>
                    </div>
                    <p className="text-[10px] font-medium mb-1.5 truncate" style={{ color: 'var(--tgo-text-muted)' }}>
                      {order.itemCount} ítem{order.itemCount !== 1 ? 's' : ''} · #{order.orderNumber}
                    </p>
                    <div className="flex items-center gap-2">
                      {/* Status badge */}
                      <span
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider"
                        style={{ backgroundColor: badge.bg, color: badge.color }}
                      >
                        {badge.icon}
                        {badge.label}
                      </span>
                    </div>
                  </div>

                  {/* Right: total + date + chevron */}
                  <div className="shrink-0 text-right flex flex-col items-end gap-1">
                    <span className="font-black text-sm" style={{ color: 'var(--tgo-text-primary)' }}>
                      ${toPesos(order.total).toLocaleString('es-AR')}
                    </span>
                    <span className="text-[9px] font-medium" style={{ color: 'var(--tgo-text-muted)' }}>
                      {formatDate(order.createdAt)}
                    </span>
                    {order.trackingUrl && (
                      <ChevronRight size={14} className="mt-0.5" style={{ color: 'var(--tgo-text-muted)' }} />
                    )}
                  </div>
                </motion.div>
              </BlurFade>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Load more */}
      {page < totalPages && (
        <div className="px-4 pb-6">
          <button
            onClick={() => { haptic.impact('light'); fetchOrders(page + 1) }}
            aria-label="Cargar más pedidos"
            disabled={loading}
            className="w-full py-3 rounded-xl border-2 text-sm font-bold transition-all disabled:opacity-50"
            style={{ borderColor: 'var(--tgo-border)', color: 'var(--tgo-text-muted)' }}
          >
            {loading ? 'Cargando...' : 'Ver más pedidos'}
          </button>
        </div>
      )}
    </div>
  )
}
