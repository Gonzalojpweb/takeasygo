'use client'

import { Clock, MapPin, Phone, Mail, Printer } from 'lucide-react'
import { BoardContextPanelShell } from '@/components/shared/operations-board'
import OrderStatusButton from '../OrderStatusButton'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { BoardContextPanelRenderProps } from '@/components/shared/operations-board'

interface OrderItem {
  _id: string
  status: string
  createdAt: string
  orderNumber: string
  customer: { name: string; phone?: string; email?: string }
  orderMode?: string
  total: number
  locationName?: string
  deliveryAddress?: { street: string; number: string; apt?: string; city?: string }
  items?: any[]
  notes?: string
  statusTimestamps?: Record<string, string>
  posSync?: { status?: string }
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  ready: 'Listo',
  en_ruta: 'En ruta',
  arrived: 'Llegó',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-amber-400',
  confirmed: 'bg-blue-500',
  preparing: 'bg-orange-400',
  ready: 'bg-emerald-500',
  en_ruta: 'bg-sky-500',
  arrived: 'bg-amber-500',
  delivered: 'bg-zinc-400',
  cancelled: 'bg-red-400',
}

const STATUS_HISTORY_KEYS = [
  { key: 'confirmedAt', label: 'Confirmado', dot: 'bg-blue-500' },
  { key: 'preparingAt', label: 'Preparando', dot: 'bg-orange-400' },
  { key: 'readyAt', label: 'Listo', dot: 'bg-emerald-500' },
  { key: 'enRouteAt', label: 'En ruta', dot: 'bg-sky-500' },
  { key: 'arrivedAt', label: 'Llegó', dot: 'bg-amber-500' },
  { key: 'deliveredAt', label: 'Entregado', dot: 'bg-zinc-400' },
  { key: 'cancelledAt', label: 'Cancelado', dot: 'bg-red-400' },
]

function formatTime(ts: string | undefined): string {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export default function OrderContextPanel({ item, tenantSlug, onClose, onRefresh }: BoardContextPanelRenderProps<OrderItem>) {
  const status = STATUS_LABELS[item.status] || item.status
  const statusDot = STATUS_DOT[item.status] || 'bg-zinc-400'
  const timestamps = item.statusTimestamps || {}
  const activeTimeline = STATUS_HISTORY_KEYS.filter(h => timestamps[h.key])

  const headerBadge = (
    <span className="flex items-center gap-1.5">
      <span className={cn('w-2 h-2 rounded-full', statusDot)} />
      <span className="text-xs font-bold text-muted-foreground">{status}</span>
    </span>
  )

  return (
    <BoardContextPanelShell
      headerTitle={`#${item.orderNumber}`}
      headerBadge={headerBadge}
      onClose={onClose}
      footer={
        <>
          {['confirmed', 'preparing'].includes(item.status) && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await fetch(`/api/${tenantSlug}/orders/${item._id}/reprint`, { method: 'POST' })
                  if (!res.ok) throw new Error()
                  toast.success('Reimprimiendo...')
                } catch {
                  toast.error('Error al reimprimir')
                }
              }}
              className="h-8 px-3 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-all flex items-center gap-1.5 text-xs font-semibold"
            >
              <Printer size={12} />
              Reimprimir
            </button>
          )}
          <div className="flex-1">
            <OrderStatusButton
              orderId={item._id}
              currentStatus={item.status}
              tenantSlug={tenantSlug}
              compact
              posSyncStatus={item.posSync?.status}
            />
          </div>
        </>
      }
    >
      {/* Customer info */}
      <div className="space-y-2">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Cliente</h4>
        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">{item.customer.name}</p>
          {item.customer.phone && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone size={11} /> {item.customer.phone}
            </p>
          )}
          {item.customer.email && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
              <Mail size={11} /> {item.customer.email}
            </p>
          )}
        </div>
      </div>

      {/* Delivery address */}
      {item.orderMode === 'delivery' && item.deliveryAddress && (
        <div className="space-y-1">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Dirección</h4>
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
            <MapPin size={12} className="text-emerald-600 mt-0.5 shrink-0" />
            <p className="text-xs text-emerald-800">
              {item.deliveryAddress.street} {item.deliveryAddress.number}
              {item.deliveryAddress.apt ? `, ${item.deliveryAddress.apt}` : ''}
              {item.deliveryAddress.city ? `, ${item.deliveryAddress.city}` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Items */}
      {item.items && item.items.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
            Items ({item.items.length})
          </h4>
          <div className="space-y-2">
            {item.items.map((orderItem: any, i: number) => (
              <div key={i} className="flex items-start justify-between gap-2 px-3 py-2 rounded-xl bg-muted/50">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    {orderItem.quantity}x {orderItem.name}
                  </p>
                </div>
                <span className="text-xs font-bold text-foreground/70 tabular-nums shrink-0">
                  ${orderItem.subtotal.toLocaleString('es-AR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {item.notes && (
        <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-xs text-amber-800">
            <span className="font-bold">Nota: </span>{item.notes}
          </p>
        </div>
      )}

      {/* Timeline */}
      {activeTimeline.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Timeline</h4>
          <div className="space-y-0">
            {activeTimeline.map((timelineItem, i) => (
              <div key={timelineItem.key} className="flex items-center gap-2.5 py-1.5">
                <div className="relative flex flex-col items-center">
                  <span className={cn('w-2.5 h-2.5 rounded-full', timelineItem.dot)} />
                  {i < activeTimeline.length - 1 && (
                    <div className="w-px h-4 bg-border/60 mt-0.5" />
                  )}
                </div>
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{timelineItem.label}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {formatTime(timestamps[timelineItem.key])}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Total */}
      <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/20">
        <span className="text-xs font-bold text-primary">Total</span>
        <span className="font-black text-lg text-primary tabular-nums">
          ${item.total.toLocaleString('es-AR')}
        </span>
      </div>
    </BoardContextPanelShell>
  )
}
