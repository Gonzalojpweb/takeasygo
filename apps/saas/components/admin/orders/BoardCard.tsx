'use client'

import { Clock, MapPin, ShoppingBag, Truck, UtensilsCrossed, Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  order: any
  isSelected: boolean
  isNew: boolean
  onClick: () => void
}

const MODE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  delivery:  { icon: Truck,          color: 'text-emerald-600', bg: 'bg-emerald-50' },
  takeaway:  { icon: ShoppingBag,    color: 'text-amber-600',   bg: 'bg-amber-50' },
  'dine-in': { icon: UtensilsCrossed, color: 'text-violet-600', bg: 'bg-violet-50' },
  business:  { icon: Briefcase,      color: 'text-blue-600',    bg: 'bg-blue-50' },
}

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-amber-400',
  confirmed: 'bg-blue-500',
  preparing: 'bg-orange-400',
  ready:     'bg-emerald-500',
  en_ruta:   'bg-sky-500',
  arrived:   'bg-amber-500',
  delivered: 'bg-zinc-400',
  cancelled: 'bg-red-400',
}

function getTimeElapsed(createdAt: string, now: number): string {
  const elapsed = now - new Date(createdAt).getTime()
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return 'Ahora'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainingMin = minutes % 60
  return `${hours}h ${remainingMin}m`
}

export default function BoardCard({ order, isSelected, isNew, onClick }: Props) {
  const mode = MODE_CONFIG[order.orderMode] || MODE_CONFIG.takeaway
  const ModeIcon = mode.icon
  const statusColor = STATUS_COLORS[order.status] || 'bg-zinc-400'
  const timeLabel = order.orderTiming === 'scheduled' && order.scheduledPickupAt
    ? new Date(order.scheduledPickupAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : getTimeElapsed(order.createdAt, Date.now())

  const isScheduledUrgent = order.orderTiming === 'scheduled' && order.scheduledPickupAt
    ? (new Date(order.scheduledPickupAt).getTime() - Date.now()) <= 5 * 60_000 && (new Date(order.scheduledPickupAt).getTime() - Date.now()) > 0
    : false

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-xl border p-3 transition-all duration-150 hover:shadow-md group/card',
        isNew && 'ring-2 ring-emerald-400/50 shadow-emerald-100 shadow-lg animate-pulse',
        isScheduledUrgent && 'ring-2 ring-red-400/50 shadow-red-100 shadow-lg animate-pulse',
        isSelected
          ? 'border-primary bg-primary/5 shadow-md'
          : 'border-border/60 bg-card hover:border-primary/30'
      )}
    >
      {/* Header: Order # + Time */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-black text-sm tracking-tight text-foreground">
            #{order.orderNumber}
          </span>
          <span className={cn('w-2 h-2 rounded-full shrink-0', statusColor)} />
        </div>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium tabular-nums">
          <Clock size={10} />
          {timeLabel}
        </span>
      </div>

      {/* Customer name */}
      <p className="text-xs font-semibold text-foreground truncate mb-1.5">
        {order.customer.name}
      </p>

      {/* Bottom: Mode + Amount + Location */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase', mode.bg, mode.color)}>
            <ModeIcon size={10} />
            {order.orderMode}
          </span>
          {order.locationName && (
            <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
              <MapPin size={8} />
              {order.locationName}
            </span>
          )}
        </div>
        <span className="font-black text-xs text-primary tabular-nums">
          ${order.total.toLocaleString('es-AR')}
        </span>
      </div>

      {/* Scheduled indicator */}
      {order.orderTiming === 'scheduled' && (
        <div className="mt-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[9px] font-bold">
          <Clock size={8} />
          Programado {new Date(order.scheduledPickupAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </button>
  )
}
