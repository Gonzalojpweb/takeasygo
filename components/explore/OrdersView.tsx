'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Package, ChevronRight, Clock, CheckCircle2, XCircle, Loader2, ShoppingBag, AlertCircle, ArrowRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { BlurFade } from '@/components/ui/blur-fade'

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  awaiting_payment: { label: 'Esperando pago', color: '#f59e0b', bg: '#fef3c7', icon: <Clock size={11} /> },
  pending:          { label: 'Recibido',        color: '#3b82f6', bg: '#eff6ff', icon: <Clock size={11} /> },
  confirmed:        { label: 'Confirmado',      color: '#8b5cf6', bg: '#f5f3ff', icon: <CheckCircle2 size={11} /> },
  preparing:        { label: 'Preparando',      color: '#f97316', bg: '#fff7ed', icon: <Loader2 size={11} className="animate-spin" /> },
  ready:            { label: '¡Listo!',         color: '#10b981', bg: '#ecfdf5', icon: <CheckCircle2 size={11} /> },
  delivered:        { label: 'Entregado',       color: '#6b7280', bg: '#f9fafb', icon: <CheckCircle2 size={11} /> },
  cancelled:        { label: 'Cancelado',       color: '#ef4444', bg: '#fef2f2', icon: <XCircle size={11} /> },
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
      <div className="h-full bg-white flex flex-col items-center justify-center px-6 text-center gap-6">
        <div className="w-20 h-20 rounded-full bg-zinc-100 flex items-center justify-center">
          <Package size={32} className="text-zinc-400" />
        </div>
        <div>
          <h3 className="font-black text-xl text-slate-900 mb-1">Tus pedidos</h3>
          <p className="text-sm text-slate-500 leading-relaxed max-w-[260px]">
            Iniciá sesión para ver el historial de tus compras y hacer seguimiento en tiempo real.
          </p>
        </div>
        <button
          onClick={() => router.push('/login?callbackUrl=/explore')}
          className="px-8 py-3 bg-[#f74211] text-white font-bold rounded-xl text-sm shadow-lg shadow-[#f74211]/20 active:scale-95 transition-all"
        >
          Iniciar sesión
        </button>
      </div>
    )
  }

  // Loading state
  if (loading && orders.length === 0) {
    return (
      <div className="h-full bg-white">
        <div className="sticky top-0 bg-white border-b border-zinc-100 px-4 py-4">
          <h2 className="font-black text-xl text-slate-900">Mis pedidos</h2>
        </div>
        <div className="p-4 space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-24 bg-zinc-50 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  // Empty state
  if (!loading && orders.length === 0) {
    return (
      <div className="h-full bg-white flex flex-col">
        <div className="sticky top-0 bg-white border-b border-zinc-100 px-4 py-4">
          <h2 className="font-black text-xl text-slate-900">Mis pedidos</h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-5">
          <div className="w-20 h-20 rounded-full bg-zinc-100 flex items-center justify-center">
            <ShoppingBag size={32} className="text-zinc-300" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-700 mb-1">Todavía no hiciste pedidos</h3>
            <p className="text-sm text-slate-400 max-w-[240px]">
              Explorá los restaurantes cercanos y hacé tu primer pedido.
            </p>
          </div>
          <button
            onClick={() => router.push('/explore')}
            className="flex items-center gap-2 px-6 py-3 bg-[#f74211] text-white font-bold rounded-xl text-sm shadow-lg shadow-[#f74211]/20"
          >
            Explorar ahora <ArrowRight size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-white overflow-y-auto no-scrollbar pb-24">
      {/* Header */}
      <div className="sticky top-0 bg-white/90 backdrop-blur-xl border-b border-zinc-100 px-4 py-4 z-10">
        <h2 className="font-black text-xl text-slate-900">Mis pedidos</h2>
        <p className="text-xs text-slate-400 font-medium mt-0.5">{orders.length} pedido{orders.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Orders list */}
      <div className="p-4 space-y-3">
        <AnimatePresence>
          {orders.map((order, i) => {
            const badge = STATUS_BADGE[order.status] ?? STATUS_BADGE.pending
            const isActive = !['delivered', 'cancelled'].includes(order.status)

            return (
              <BlurFade key={order.id} delay={i * 0.04} inView>
                <motion.div
                  layout
                  onClick={() => order.trackingUrl && router.push(order.trackingUrl)}
                  className={`relative flex items-center gap-3 p-4 rounded-2xl border transition-all active:scale-[0.99] ${
                    isActive
                      ? 'border-2 cursor-pointer bg-white shadow-sm'
                      : 'border border-zinc-100 cursor-pointer bg-white hover:bg-zinc-50'
                  }`}
                  style={isActive ? { borderColor: order.tenant?.primaryColor + '40' } : {}}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <div
                      className="absolute top-3 right-3 w-2 h-2 rounded-full animate-pulse"
                      style={{ backgroundColor: order.tenant?.primaryColor ?? '#f74211' }}
                    />
                  )}

                  {/* Logo */}
                  <div className="shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-zinc-100 flex items-center justify-center border border-zinc-100">
                    {order.tenant?.logoUrl ? (
                      <img src={order.tenant.logoUrl} alt={order.tenant.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package size={20} className="text-zinc-400" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-sm text-slate-900 truncate">
                        {order.tenant?.name ?? 'Restaurante'}
                      </h3>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium mb-1.5 truncate">
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
                    <span className="font-black text-sm text-slate-900">
                      ${order.total.toLocaleString('es-AR')}
                    </span>
                    <span className="text-[9px] text-slate-400 font-medium">
                      {formatDate(order.createdAt)}
                    </span>
                    {order.trackingUrl && (
                      <ChevronRight size={14} className="text-zinc-300 mt-0.5" />
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
            onClick={() => fetchOrders(page + 1)}
            disabled={loading}
            className="w-full py-3 rounded-xl border-2 border-zinc-100 text-sm font-bold text-slate-500 hover:border-zinc-200 transition-all disabled:opacity-50"
          >
            {loading ? 'Cargando...' : 'Ver más pedidos'}
          </button>
        </div>
      )}
    </div>
  )
}
