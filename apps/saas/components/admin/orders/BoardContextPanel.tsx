'use client'

import { X, Clock, MapPin, Phone, Mail, CheckCircle2, Printer, AlertCircle } from 'lucide-react'
import OrderStatusButton from '../OrderStatusButton'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Props {
  order: any
  tenantSlug: string
  onClose: () => void
  onRefresh: () => void
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

function formatDate(ts: string | undefined): string {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function BoardContextPanel({ order, tenantSlug, onClose, onRefresh }: Props) {
  const status = STATUS_LABELS[order.status] || order.status
  const statusDot = STATUS_DOT[order.status] || 'bg-zinc-400'
  const timestamps = order.statusTimestamps || {}
  const activeTimeline = STATUS_HISTORY_KEYS.filter(h => timestamps[h.key])

  return (
    <div className="w-full h-full bg-card flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="font-black text-base tracking-tight text-foreground">
            #{order.orderNumber}
          </span>
          <span className={cn('w-2 h-2 rounded-full', statusDot)} />
          <span className="text-xs font-bold text-muted-foreground">{status}</span>
        </div>
        <button
          onClick={onClose}
          className="h-7 w-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Customer info */}
        <div className="space-y-2">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Cliente</h4>
          <div className="space-y-1">
            <p className="text-sm font-bold text-foreground">{order.customer.name}</p>
            {order.customer.phone && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone size={11} /> {order.customer.phone}
              </p>
            )}
            {order.customer.email && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                <Mail size={11} /> {order.customer.email}
              </p>
            )}
          </div>
        </div>

        {/* Delivery address */}
        {order.orderMode === 'delivery' && order.deliveryAddress && (
          <div className="space-y-1">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Dirección</h4>
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
              <MapPin size={12} className="text-emerald-600 mt-0.5 shrink-0" />
              <p className="text-xs text-emerald-800">
                {order.deliveryAddress.street} {order.deliveryAddress.number}
                {order.deliveryAddress.apt ? `, ${order.deliveryAddress.apt}` : ''}
                {order.deliveryAddress.city ? `, ${order.deliveryAddress.city}` : ''}
              </p>
            </div>
          </div>
        )}

        {/* Items */}
        <div className="space-y-2">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
            Items ({order.items?.length || 0})
          </h4>
          <div className="space-y-2">
            {order.items?.map((item: any, i: number) => (
              <div key={i} className="flex items-start justify-between gap-2 px-3 py-2 rounded-xl bg-muted/50">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    {item.quantity}x {item.name}
                  </p>
                  {item.customizations?.some((c: any) => c.selectedOptions?.length > 0) && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {item.customizations
                        .filter((c: any) => c.selectedOptions?.length > 0)
                        .map((c: any) => `${c.groupName}: ${c.selectedOptions.map((o: any) => o.name).join(', ')}`)
                        .join(' · ')}
                    </p>
                  )}
                </div>
                <span className="text-xs font-bold text-foreground/70 tabular-nums shrink-0">
                  ${item.subtotal.toLocaleString('es-AR')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        {order.notes && (
          <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-xs text-amber-800">
              <span className="font-bold">Nota: </span>{order.notes}
            </p>
          </div>
        )}

        {/* Timeline */}
        {activeTimeline.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Timeline</h4>
            <div className="space-y-0">
              {activeTimeline.map((item, i) => (
                <div key={item.key} className="flex items-center gap-2.5 py-1.5">
                  <div className="relative flex flex-col items-center">
                    <span className={cn('w-2.5 h-2.5 rounded-full', item.dot)} />
                    {i < activeTimeline.length - 1 && (
                      <div className="w-px h-4 bg-border/60 mt-0.5" />
                    )}
                  </div>
                  <div className="flex-1 flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">{item.label}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {formatTime(timestamps[item.key])}
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
            ${order.total.toLocaleString('es-AR')}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-border/50 flex items-center gap-2">
        {['confirmed', 'preparing'].includes(order.status) && (
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await fetch(`/api/${tenantSlug}/orders/${order._id}/reprint`, { method: 'POST' })
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
            orderId={order._id.toString()}
            currentStatus={order.status}
            tenantSlug={tenantSlug}
            compact
            posSyncStatus={order.posSync?.status}
          />
        </div>
      </div>
    </div>
  )
}
