'use client'

import { ShoppingBag, Clock, Package, Truck, CheckCircle2 } from 'lucide-react'
import { BoardInsightsShell } from '@/components/shared/operations-board'
import { cn } from '@/lib/utils'
import { toPesos } from '@takeasygo/business'
import type { BoardInsightsRenderProps } from '@/components/shared/operations-board'

interface OrderItem {
  _id: string
  status: string
  createdAt: string
  orderNumber: string
  customer: { name: string }
  total: number
}

const STATUS_CONFIG = [
  { status: 'pending',   label: 'Pendientes',  icon: Clock,        color: 'bg-amber-400',  bgColor: 'bg-amber-50' },
  { status: 'confirmed', label: 'Confirmados', icon: Package,      color: 'bg-blue-500',   bgColor: 'bg-blue-50' },
  { status: 'preparing', label: 'Preparando',  icon: Package,      color: 'bg-orange-400', bgColor: 'bg-orange-50' },
  { status: 'ready',     label: 'Listos',      icon: CheckCircle2, color: 'bg-emerald-500',bgColor: 'bg-emerald-50' },
  { status: 'en_ruta',   label: 'En Ruta',     icon: Truck,        color: 'bg-sky-500',    bgColor: 'bg-sky-50' },
  { status: 'arrived',   label: 'Llegaron',    icon: CheckCircle2, color: 'bg-amber-500',  bgColor: 'bg-amber-50' },
]

export default function OrderInsights({ items }: BoardInsightsRenderProps<OrderItem>) {
  const totalOrders = items.length
  const activeOrders = items.filter(o => ['pending', 'confirmed', 'preparing', 'ready', 'en_ruta', 'arrived'].includes(o.status))

  const statusCounts = STATUS_CONFIG.map(s => ({
    ...s,
    count: items.filter(o => o.status === s.status).length,
  }))

  const maxCount = Math.max(...statusCounts.map(s => s.count), 1)
  const lastOrder = items.length > 0 ? items[0] : null

  return (
    <BoardInsightsShell>
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-muted/50 p-3">
          <p className="text-[10px] font-bold uppercase text-muted-foreground/60 mb-1">Total</p>
          <p className="text-xl font-black text-foreground tabular-nums">{totalOrders}</p>
        </div>
        <div className="rounded-xl bg-primary/5 p-3">
          <p className="text-[10px] font-bold uppercase text-primary/60 mb-1">Activos</p>
          <p className="text-xl font-black text-primary tabular-nums">{activeOrders.length}</p>
        </div>
      </div>

      {/* Status bars */}
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Por estado</p>
        {statusCounts.map(item => {
          const barWidth = maxCount > 0 ? (item.count / maxCount) * 100 : 0
          return (
            <div key={item.status} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 w-[90px] shrink-0">
                <span className={cn('w-2 h-2 rounded-full', item.color)} />
                <span className="text-[10px] font-semibold text-foreground/70 truncate">{item.label}</span>
              </div>
              <div className="flex-1 h-4 bg-muted/50 rounded overflow-hidden">
                <div
                  className={cn('h-full rounded transition-all duration-300', item.bgColor)}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span className="text-[10px] font-bold text-foreground/60 tabular-nums w-[24px] text-right">
                {item.count}
              </span>
            </div>
          )
        })}
      </div>

      {/* Last order */}
      {lastOrder && (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Último pedido</p>
          <div className="rounded-xl border border-border/50 p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-foreground">#{lastOrder.orderNumber}</span>
              <span className="text-[10px] font-semibold text-muted-foreground">
                {new Date(lastOrder.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-xs font-semibold text-foreground/70">{lastOrder.customer.name}</p>
            <p className="text-xs font-bold text-primary tabular-nums">${toPesos(lastOrder.total).toLocaleString('es-AR')}</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {totalOrders === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
            <ShoppingBag className="text-muted-foreground" size={20} />
          </div>
          <p className="text-xs font-bold text-foreground">Sin pedidos hoy</p>
          <p className="text-[10px] text-muted-foreground mt-1">Los nuevos pedidos aparecerán aquí</p>
        </div>
      )}

      {/* Hint */}
      <div className="px-3 py-2.5 rounded-xl bg-muted/30 border border-border/30">
        <p className="text-[10px] text-muted-foreground text-center">
          Seleccioná un pedido del tablero para ver detalles completos
        </p>
      </div>
    </BoardInsightsShell>
  )
}
