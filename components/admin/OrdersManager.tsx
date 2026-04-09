'use client'

import { useState, useTransition, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ShoppingBag, Search, RefreshCw, MapPin, Phone, Mail, Clock, CheckCircle2, Radio } from 'lucide-react'
import OrderStatusButton from './OrderStatusButton'
import { cn } from '@/lib/utils'
import { useNotificationSound } from '@/hooks/useNotificationSound'
import { toast } from 'sonner'

interface Props {
  orders: any[]
  locationMap: Record<string, string>
  tenantSlug: string
  trialOrderCount?: number
  load30m?: number
  load60m?: number
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  pending:   { label: 'Pendiente',   dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  confirmed: { label: 'Confirmado',  dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  preparing: { label: 'Preparando',  dot: 'bg-orange-400',  badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  ready:     { label: 'Listo',       dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  delivered: { label: 'Entregado',   dot: 'bg-zinc-400',    badge: 'bg-zinc-50 text-zinc-600 border-zinc-200' },
  cancelled: { label: 'Cancelado',   dot: 'bg-red-400',     badge: 'bg-red-50 text-red-600 border-red-200' },
}

const FILTER_TABS = [
  { value: 'all',       label: 'Todos' },
  { value: 'active',    label: 'Activos' },
  { value: 'pending',   label: 'Pendientes' },
  { value: 'confirmed', label: 'Confirmados' },
  { value: 'preparing', label: 'Preparando' },
  { value: 'ready',     label: 'Listos' },
  { value: 'delivered', label: 'Completados' },
  { value: 'cancelled', label: 'Cancelados' },
]

const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready']

// Paleta de colores por categoría (se asigna por índice)
const CATEGORY_COLORS = [
  'text-violet-600', 'text-orange-500', 'text-blue-600',
  'text-emerald-600', 'text-rose-500', 'text-amber-600',
]

export default function OrdersManager({ orders, locationMap, tenantSlug, trialOrderCount, load30m, load60m }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState('pending')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    setLastUpdated(new Date())
  }, [])
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set())
  const playSound = useNotificationSound()
  const knownIdsRef = useRef<Set<string>>(new Set(orders.map(o => o._id)))

  const doRefresh = useCallback(() => {
    startTransition(() => {
      router.refresh()
      setLastUpdated(new Date())
    })
  }, [router])

  // Auto-refresh cada 10s cuando hay órdenes activas, 30s si no
  useEffect(() => {
    const hasActive = orders.some(o => ACTIVE_STATUSES.includes(o.status))
    const interval = setInterval(doRefresh, hasActive ? 10_000 : 30_000)
    return () => clearInterval(interval)
  }, [orders, doRefresh])

  // Refresh inmediato cuando el tab vuelve a ser visible
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') doRefresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [doRefresh])

  // Detectar nuevos pedidos pendientes → sonido + toast
  useEffect(() => {
    const incoming = orders.filter(o => !knownIdsRef.current.has(o._id))
    const newPending = incoming.filter(o => o.status === 'pending')
    if (newPending.length > 0) {
      playSound()
      setNewOrderIds(prev => new Set([...prev, ...newPending.map(o => o._id)]))
      toast(`🛍️ ${newPending.length === 1 ? 'Nuevo pedido' : `${newPending.length} nuevos pedidos`}`, {
        description: newPending.map(o => `#${o.orderNumber} · ${o.customer.name}`).join(' — '),
        duration: 8000,
        position: 'top-center',
      })
      // Limpiar highlight después de 8s
      setTimeout(() => {
        setNewOrderIds(prev => {
          const next = new Set(prev)
          newPending.forEach(o => next.delete(o._id))
          return next
        })
      }, 8000)
    }
    knownIdsRef.current = new Set(orders.map(o => o._id))
  }, [orders, playSound])

  function handleRefresh() { doRefresh() }

  const countByStatus = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const activeCount = ACTIVE_STATUSES.reduce((sum, s) => sum + (countByStatus[s] || 0), 0)

  const filtered = orders.filter(order => {
    const matchSearch = !searchTerm ||
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.customer.phone || '').includes(searchTerm)

    const matchFilter =
      activeFilter === 'all'    ? true :
      activeFilter === 'active' ? ACTIVE_STATUSES.includes(order.status) :
      order.status === activeFilter

    return matchSearch && matchFilter
  })

  return (
    <div className="space-y-4">

      {/* Trial milestone banner */}
      {trialOrderCount !== undefined && trialOrderCount >= 30 && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-violet-500/5 border-2 border-violet-500/20">
          <span className="text-xl shrink-0">🎉</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">¡Ya tenemos suficiente información para analizar tu operación!</p>
            <p className="text-xs text-muted-foreground">Procesaste {trialOrderCount} pedidos. Tu Informe ICO está listo.</p>
          </div>
          <a href="./ico" className="shrink-0 h-8 px-3 rounded-xl bg-violet-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-violet-600 transition-all flex items-center">Ver →</a>
        </div>
      )}

      {/* Indicador de carga operativa en tiempo real */}
      {load60m !== undefined && load60m > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-2xl border border-border/60 bg-card">
          <div className={cn(
            'w-2 h-2 rounded-full shrink-0',
            load30m !== undefined && load30m >= 5 ? 'bg-red-500 animate-pulse' :
            load30m !== undefined && load30m >= 3 ? 'bg-amber-400 animate-pulse' :
            'bg-emerald-500'
          )} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-foreground">
              {load30m !== undefined && load30m >= 5 ? '⚠ Alta demanda' :
               load30m !== undefined && load30m >= 3 ? 'Demanda moderada' :
               'Operación fluida'}
            </p>
            <p className="text-[10px] text-muted-foreground font-medium">
              {load30m ?? 0} pedidos en los últimos 30 min · {load60m} en la última hora
            </p>
          </div>
          {load30m !== undefined && load30m > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              {[...Array(Math.min(load30m, 8))].map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'w-1.5 rounded-full transition-all',
                    i < 3 ? 'bg-emerald-500' : i < 5 ? 'bg-amber-400' : 'bg-red-500'
                  )}
                  style={{ height: `${8 + i * 3}px` }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search + Refresh */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <input
            type="text"
            placeholder="Buscar número, cliente o teléfono..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-muted/50 border border-border/60 focus:border-primary/40 rounded-xl pl-9 pr-4 py-2.5 outline-none transition-all text-sm"
          />
        </div>
        <button
          onClick={handleRefresh}
          disabled={isPending}
          title="Actualizar pedidos"
          className="h-9 w-9 rounded-xl border border-border/60 bg-muted/50 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-all shrink-0"
        >
          <RefreshCw size={15} className={cn(isPending && 'animate-spin')} />
        </button>
        {/* Indicador en vivo */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Radio size={12} className={cn('text-emerald-500', isPending && 'opacity-40')} />
          <span className="text-xs text-muted-foreground font-medium hidden sm:block">
            {isPending ? 'Actualizando...' : lastUpdated ? lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
          </span>
        </div>
        <span className="text-xs text-muted-foreground font-medium shrink-0">
          {filtered.length} pedido{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {FILTER_TABS.map(tab => {
          const count =
            tab.value === 'active' ? activeCount :
            tab.value === 'all'    ? orders.length :
            (countByStatus[tab.value] || 0)
          const isActive = activeFilter === tab.value
          return (
            <button
              key={tab.value}
              onClick={() => setActiveFilter(tab.value)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 border',
                isActive
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-background text-muted-foreground border-border/60 hover:bg-muted hover:text-foreground'
              )}
            >
              {tab.label}
              {count > 0 && (
                <span className={cn(
                  'inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-black px-1',
                  isActive ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
                )}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Grid de cards */}
      <AnimatePresence mode="popLayout">
        {filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mb-4">
              <ShoppingBag className="text-muted-foreground" size={22} />
            </div>
            <p className="font-bold text-sm">No hay pedidos</p>
            <p className="text-xs text-muted-foreground mt-1">
              {activeFilter === 'pending' ? 'Los nuevos pedidos aparecerán aquí.' : 'Cambiá el filtro para ver otros estados.'}
            </p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((order: any, index: number) => {
              const status = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
              const locationName = locationMap[order.locationId?.toString()] || 'Sede'
              const time = new Date(order.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
              const date = new Date(order.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })

              // Agrupar items por categoría
              const byCategory: Record<string, any[]> = {}
              for (const item of order.items) {
                const cat = item.categoryName || 'Otros'
                if (!byCategory[cat]) byCategory[cat] = []
                byCategory[cat].push(item)
              }
              const categories = Object.entries(byCategory)

              return (
                <motion.div
                  key={order._id}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.03, duration: 0.18 }}
                  className={cn(
                    "bg-card border rounded-2xl overflow-hidden flex flex-col hover:shadow-md transition-all",
                    newOrderIds.has(order._id)
                      ? "border-emerald-400 shadow-emerald-100 shadow-lg ring-2 ring-emerald-300/40"
                      : "border-border/70 hover:border-primary/30"
                  )}
                >
                  {/* Card header */}
                  <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-base tracking-tight text-foreground">
                        #{order.orderNumber}
                      </span>
                      <span className={cn(
                        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border',
                        status.badge
                      )}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', status.dot)} />
                        {status.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {date} {time}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin size={11} />
                        {locationName}
                      </span>
                    </div>
                  </div>

                  {/* Customer + total */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
                    <span className="font-bold text-sm text-foreground">{order.customer.name}</span>
                    <span className="font-black text-base text-primary tabular-nums">
                      ${order.total.toLocaleString('es-AR')}
                    </span>
                  </div>

                  {/* Items por categoría */}
                  <div className="px-4 py-3 space-y-3 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Items:</p>
                    {categories.map(([catName, items], catIndex) => (
                      <div key={catName}>
                        <p className={cn('text-[10px] font-black uppercase tracking-widest mb-1', CATEGORY_COLORS[catIndex % CATEGORY_COLORS.length])}>
                          {catName}
                        </p>
                        <div className="space-y-2">
                          {items.map((item: any) => (
                            <div key={item._id} className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground leading-tight">
                                  {item.quantity}x {item.name}
                                </p>
                                {item.customizations?.map((c: any, ci: number) => (
                                  c.selectedOptions?.length > 0 && (
                                    <p key={ci} className="text-xs text-muted-foreground mt-0.5">
                                      <span className="font-semibold uppercase text-[10px] tracking-wide">{c.groupName}:</span>{' '}
                                      {c.selectedOptions.map((o: any) => o.name).join(', ')}
                                    </p>
                                  )
                                ))}
                              </div>
                              <span className="text-sm font-bold text-foreground/70 tabular-nums shrink-0">
                                ${item.subtotal.toLocaleString('es-AR')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Notas */}
                    {order.notes && (
                      <div className="mt-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                        <span className="font-bold">Nota: </span>{order.notes}
                      </div>
                    )}
                  </div>

                  {/* Contacto */}
                  {(order.customer.phone || order.customer.email) && (
                    <div className="px-4 pb-3 flex flex-wrap gap-x-4 gap-y-1">
                      {order.customer.phone && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone size={11} />
                          {order.customer.phone}
                        </span>
                      )}
                      {order.customer.email && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground truncate max-w-full">
                          <Mail size={11} className="shrink-0" />
                          {order.customer.email}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Confirmación de retiro (cuando está entregado) */}
                  {order.status === 'delivered' && order.statusTimestamps?.deliveredAt && (
                    <div className="mx-4 mb-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
                      <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                      <span className="text-xs font-semibold text-emerald-700">Cliente confirmó retiro</span>
                      <span className="ml-auto text-[10px] text-emerald-600 font-medium tabular-nums">
                        {new Date(order.statusTimestamps.deliveredAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}

                  {/* Footer: acción */}
                  <div className="px-4 pb-4 pt-1 border-t border-border/40 flex items-center justify-between gap-3">
                    <span className="text-[10px] text-muted-foreground/40 font-bold uppercase tracking-widest">
                      ID: {order._id.toString().slice(-6)}
                    </span>
                    <OrderStatusButton
                      orderId={order._id.toString()}
                      currentStatus={order.status}
                      tenantSlug={tenantSlug}
                      compact
                    />
                  </div>

                </motion.div>
              )
            })}
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
