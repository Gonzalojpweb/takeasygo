'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, RefreshCw, Radio, Volume2, VolumeX, Trash2 } from 'lucide-react'
import BoardColumn from './BoardColumn'
import BoardContextPanel from './BoardContextPanel'
import BoardInsights from './BoardInsights'
import { cn } from '@/lib/utils'
import { useNotificationSound } from '@/hooks/useNotificationSound'
import { toast } from 'sonner'

interface Props {
  orders: any[]
  locationMap: Record<string, string>
  tenantSlug: string
  locations?: { _id: string; name: string }[]
  userAssignedLocations?: string[]
}

const BOARD_COLUMNS = [
  { status: 'pending',    title: 'Pendientes',   dotColor: 'bg-amber-400',  color: 'bg-amber-100 text-amber-700' },
  { status: 'confirmed',  title: 'Confirmados',  dotColor: 'bg-blue-500',   color: 'bg-blue-100 text-blue-700' },
  { status: 'preparing',  title: 'Preparando',    dotColor: 'bg-orange-400', color: 'bg-orange-100 text-orange-700' },
  { status: 'ready',      title: 'Listos',        dotColor: 'bg-emerald-500', color: 'bg-emerald-100 text-emerald-700' },
  { status: 'en_ruta',    title: 'En Ruta',       dotColor: 'bg-sky-500',   color: 'bg-sky-100 text-sky-700' },
  { status: 'delivered',  title: 'Entregados',    dotColor: 'bg-zinc-400',  color: 'bg-zinc-100 text-zinc-600' },
]

const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'en_ruta', 'arrived']

export default function OperationsBoard({ orders, locationMap, tenantSlug, locations = [], userAssignedLocations = [] }: Props) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [activeLocation, setActiveLocation] = useState('all')
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [cleanupLoading, setCleanupLoading] = useState(false)

  const { play: playSound, stop: stopSound } = useNotificationSound()
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set())
  const knownIdsRef = useRef<Set<string>>(new Set(orders.map(o => o._id)))
  const ringingIdsRef = useRef<Set<string>>(new Set())

  const isAdmin = userAssignedLocations.length === 0
  const availableLocations = isAdmin
    ? locations
    : locations.filter(l => userAssignedLocations.includes(l._id))

  // Refresh
  const doRefresh = useCallback(() => {
    router.refresh()
    setLastUpdated(new Date())
  }, [router])

  // Auto-refresh: 10s when active orders, 30s otherwise
  useEffect(() => {
    const hasActive = orders.some(o => ACTIVE_STATUSES.includes(o.status))
    const interval = setInterval(doRefresh, hasActive ? 10_000 : 30_000)
    return () => clearInterval(interval)
  }, [orders, doRefresh])

  // Refresh on tab visible
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') doRefresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [doRefresh])

  // Reloj
  useEffect(() => {
    const interval = setInterval(() => setLastUpdated(new Date()), 30_000)
    return () => clearInterval(interval)
  }, [])

  // Detect new orders → sound + toast
  useEffect(() => {
    const incoming = orders.filter(o => !knownIdsRef.current.has(o._id))
    const newOrders = incoming.filter(o => o.status === 'pending' || o.status === 'confirmed')
    if (newOrders.length > 0 && soundEnabled) {
      playSound(true)
      newOrders.forEach(o => ringingIdsRef.current.add(o._id))
      setNewOrderIds(prev => new Set([...prev, ...newOrders.map(o => o._id)]))
      toast(`🛍️ ${newOrders.length === 1 ? 'Nuevo pedido' : `${newOrders.length} nuevos pedidos`}`, {
        description: newOrders.map(o => `#${o.orderNumber} · ${o.customer.name}`).join(' — '),
        duration: 8000,
        position: 'top-center',
      })
      setTimeout(() => {
        setNewOrderIds(prev => {
          const next = new Set(prev)
          newOrders.forEach(o => next.delete(o._id))
          return next
        })
      }, 8000)
    }
    knownIdsRef.current = new Set(orders.map(o => o._id))

    // Stop ring if all processed
    if (ringingIdsRef.current.size > 0) {
      const stillUnprocessed = new Set(
        orders.filter(o => o.status === 'pending' || o.status === 'confirmed').map(o => o._id)
      )
      const stillRinging = new Set([...ringingIdsRef.current].filter(id => stillUnprocessed.has(id)))
      if (stillRinging.size === 0) stopSound()
      ringingIdsRef.current = stillRinging
    }
  }, [orders, playSound, stopSound, soundEnabled])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopSound()
  }, [stopSound])

  // Cleanup cancelled orders
  const handleCleanup = useCallback(async () => {
    if (!confirm('¿Eliminar pedidos cancelados con más de 24 horas? Esta acción no se puede deshacer.')) return
    setCleanupLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/orders/cleanup-cancelled`, { method: 'POST' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      toast.success(data.message || 'Limpieza completada')
      doRefresh()
    } catch {
      toast.error('Error al limpiar pedidos cancelados')
    } finally {
      setCleanupLoading(false)
    }
  }, [tenantSlug, doRefresh])

  // Filter orders
  const filteredOrders = orders.filter(order => {
    const matchSearch = !searchTerm ||
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.customer.phone || '').includes(searchTerm)
    const matchLocation = activeLocation === 'all' || order.locationId?.toString() === activeLocation
    return matchSearch && matchLocation
  })

  // Group by status
  const ordersByStatus = BOARD_COLUMNS.reduce((acc, col) => {
    acc[col.status] = filteredOrders.filter(o => o.status === col.status)
    return acc
  }, {} as Record<string, any[]>)

  const activeCount = ACTIVE_STATUSES.reduce((sum, s) => sum + (ordersByStatus[s]?.length || 0), 0)

  return (
    <div className="flex h-[calc(100dvh-140px)] gap-0 relative">
      {/* Main board area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-border/50 md:px-4 md:py-3 md:gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[140px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <input
              type="text"
              placeholder="Buscar #, cliente..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-muted/50 border border-border/60 focus:border-primary/40 rounded-xl pl-9 pr-3 py-2 outline-none transition-all text-xs"
            />
          </div>

          {/* Location filter — hidden on small screens */}
          {availableLocations.length > 0 && (
            <div className="hidden md:flex items-center gap-1.5">
              <button
                onClick={() => setActiveLocation('all')}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border shrink-0',
                  activeLocation === 'all'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border/60 hover:bg-muted'
                )}
              >
                Todas
              </button>
              {availableLocations.map(loc => (
                <button
                  key={loc._id}
                  onClick={() => setActiveLocation(loc._id)}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border shrink-0',
                    activeLocation === loc._id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border/60 hover:bg-muted'
                  )}
                >
                  {loc.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5 md:gap-2 ml-auto">
            {/* Sound toggle */}
            <button
              onClick={() => setSoundEnabled(v => !v)}
              className={cn(
                'h-7 w-7 rounded-lg border border-border/60 flex items-center justify-center transition-all',
                soundEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              )}
              title={soundEnabled ? 'Silenciar alertas' : 'Activar alertas'}
            >
              {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
            </button>

            {/* Cleanup cancelled */}
            <button
              onClick={handleCleanup}
              disabled={cleanupLoading}
              className="h-7 px-2 rounded-lg border border-border/60 bg-muted/50 hover:bg-muted flex items-center gap-1 text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
              title="Limpiar cancelados (>24h)"
            >
              <Trash2 size={12} />
              <span className="text-[10px] font-semibold hidden lg:inline">Limpiar</span>
            </button>

            {/* Refresh */}
            <button
              onClick={doRefresh}
              className="h-7 w-7 rounded-lg border border-border/60 bg-muted/50 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
              title="Actualizar"
            >
              <RefreshCw size={13} />
            </button>

            {/* Live indicator — hidden on small screens */}
            <div className="hidden sm:flex items-center gap-1.5">
              <Radio size={10} className="text-emerald-500" />
              <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
                {lastUpdated ? lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </span>
            </div>

            {/* Counts */}
            <span className="text-[10px] text-muted-foreground font-bold tabular-nums">
              {filteredOrders.length} total · {activeCount} activos
            </span>
          </div>
        </div>

        {/* Board columns */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-3 md:p-4">
          <div className="flex gap-3 h-full md:gap-4">
            {BOARD_COLUMNS.map(col => (
              <BoardColumn
                key={col.status}
                title={col.title}
                status={col.status}
                color={col.color}
                dotColor={col.dotColor}
                orders={ordersByStatus[col.status] || []}
                selectedOrderId={selectedOrder?._id}
                newOrderIds={newOrderIds}
                onSelectOrder={setSelectedOrder}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Context Panel — Always visible on desktop, overlay on mobile/tablet */}
      {/* Desktop: always visible side panel */}
      <div className="hidden lg:block w-[340px] shrink-0 h-full border-l border-border/50">
        {selectedOrder ? (
          <BoardContextPanel
            order={selectedOrder}
            tenantSlug={tenantSlug}
            onClose={() => setSelectedOrder(null)}
            onRefresh={doRefresh}
          />
        ) : (
          <BoardInsights orders={orders} />
        )}
      </div>

      {/* Mobile/Tablet: overlay when order selected */}
      {selectedOrder && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedOrder(null)} />
          <div className="relative ml-auto w-full max-w-[380px]">
            <BoardContextPanel
              order={selectedOrder}
              tenantSlug={tenantSlug}
              onClose={() => setSelectedOrder(null)}
              onRefresh={doRefresh}
            />
          </div>
        </div>
      )}
    </div>
  )
}
