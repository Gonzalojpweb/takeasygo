'use client'

import { useState, useEffect } from 'react'
import {
  X, Store, ShoppingCart, Loader2, Calendar, Clock,
  DollarSign, Award, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { toPesos } from '@takeasygo/business'

interface Consumer {
  _id: string
  name: string
  email: string
  phone: string
  tenantIds: string[]
  totalOrders: number
  totalSpent: number
  isLoyaltyMember: boolean
  lastOrderAt: string | null
}

interface OrderItem {
  name: string
  price: number
  quantity: number
  subtotal: number
}

interface ConsumerOrder {
  _id: string
  orderNumber: string
  status: string
  total: number
  subtotal: number
  items: OrderItem[]
  customer: { name: string; email: string; phone: string }
  tenantName: string
  tenantSlug: string
  createdAt: string
}

interface Props {
  consumer: Consumer
  onClose: () => void
}

export default function ConsumerDetailModal({ consumer, onClose }: Props) {
  const [orders, setOrders] = useState<ConsumerOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    async function fetchOrders() {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/superadmin/consumers/${consumer._id}/orders?page=${page}&limit=10`
        )
        if (!res.ok) throw new Error()
        const data = await res.json()
        setOrders(data.orders || [])
        setTotalPages(data.totalPages || 1)
      } catch {
        /* silent */
      } finally {
        setLoading(false)
      }
    }
    fetchOrders()
  }, [consumer._id, page])

  const formatCurrency = (n: number) => `$${toPesos(n).toLocaleString('es-AR')}`

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 30 }}
          transition={{ type: 'spring', damping: 28, stiffness: 380 }}
          className="w-full max-w-2xl bg-white rounded-3xl max-h-[85dvh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-zinc-100 p-5 flex items-center justify-between rounded-t-3xl z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                {(consumer.name || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="font-bold text-base">{consumer.name || 'Sin nombre'}</h2>
                <p className="text-xs text-muted-foreground">{consumer.email || consumer.phone || 'Sin contacto'}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 bg-muted/20 rounded-2xl border border-border/40">
                <ShoppingCart size={16} className="text-primary mb-1.5" />
                <p className="text-xl font-bold">{consumer.totalOrders}</p>
                <p className="text-[10px] uppercase font-bold text-muted-foreground/50 mt-0.5">Órdenes</p>
              </div>
              <div className="p-4 bg-muted/20 rounded-2xl border border-border/40">
                <DollarSign size={16} className="text-primary mb-1.5" />
                <p className="text-xl font-bold">{formatCurrency(consumer.totalSpent)}</p>
                <p className="text-[10px] uppercase font-bold text-muted-foreground/50 mt-0.5">Gastado</p>
              </div>
              <div className="p-4 bg-muted/20 rounded-2xl border border-border/40">
                <Store size={16} className="text-primary mb-1.5" />
                <p className="text-xl font-bold">{consumer.tenantIds.length}</p>
                <p className="text-[10px] uppercase font-bold text-muted-foreground/50 mt-0.5">Tenants</p>
              </div>
              <div className="p-4 bg-muted/20 rounded-2xl border border-border/40">
                <Award size={16} className={cn('mb-1.5', consumer.isLoyaltyMember ? 'text-amber-500' : 'text-muted-foreground/30')} />
                <p className="text-xl font-bold">{consumer.isLoyaltyMember ? 'Sí' : 'No'}</p>
                <p className="text-[10px] uppercase font-bold text-muted-foreground/50 mt-0.5">Club</p>
              </div>
            </div>

            {/* Orders history */}
            <div>
              <h3 className="font-bold text-sm mb-3">Historial de órdenes</h3>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-muted-foreground" />
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No se encontraron órdenes
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map((order) => (
                    <div
                      key={order._id}
                      className="p-4 bg-muted/20 rounded-2xl border border-border/40 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">#{order.orderNumber?.slice(-6) || '—'}</span>
                          <span className={cn(
                            'text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider',
                            order.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' :
                            order.status === 'delivered' ? 'bg-blue-100 text-blue-700' :
                            'bg-zinc-100 text-zinc-700'
                          )}>
                            {order.status}
                          </span>
                        </div>
                        <span className="font-bold text-sm">{formatCurrency(order.total)}</span>
                      </div>

                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Store size={10} />
                          {order.tenantName}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar size={10} />
                          {new Date(order.createdAt).toLocaleDateString('es-AR')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {new Date(order.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="space-y-1 pt-1">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              <span className="font-mono text-muted-foreground/50">x{item.quantity}</span>{' '}
                              {item.name}
                            </span>
                            <span className="font-medium">{formatCurrency(item.subtotal)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-4">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-2 rounded-xl border-2 border-border/60 disabled:opacity-30 hover:bg-muted/30 transition-all"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-2 rounded-xl border-2 border-border/60 disabled:opacity-30 hover:bg-muted/30 transition-all"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
