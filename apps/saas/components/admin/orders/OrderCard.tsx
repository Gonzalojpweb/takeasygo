'use client'

import { useState, useEffect } from 'react'
import { Clock, MapPin, ShoppingBag, Truck, UtensilsCrossed, Briefcase, AlarmClock, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toPesos } from '@takeasygo/business/browser'
import type { BoardCardRenderProps } from '@/components/shared/operations-board'

interface OrderItem {
  _id: string
  status: string
  createdAt: string
  orderNumber: string
  customer: { name: string; phone?: string }
  orderMode?: string
  total: number
  locationName?: string
  orderTiming?: string
  scheduledPickupAt?: string
  printNotBefore?: string | null
  payment?: { method?: string }
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

/** Countdown vivo hasta una fecha futura ("7h 30m", "25m", "ahora"). */
function getCountdown(target: string, now: number): string {
  const diff = new Date(target).getTime() - now
  if (diff <= 0) return '¡ya!'
  const totalMin = Math.floor(diff / 60_000)
  if (totalMin < 60) return `${totalMin}m`
  const hours = Math.floor(totalMin / 60)
  const minutes = totalMin % 60
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}

function useElapsed(createdAt: string): string {
  const [elapsed, setElapsed] = useState(() => getTimeElapsed(createdAt, Date.now()))
  useEffect(() => {
    const id = setInterval(() => setElapsed(getTimeElapsed(createdAt, Date.now())), 30_000)
    return () => clearInterval(id)
  }, [createdAt])
  return elapsed
}

/** Ticker compartido para countdowns y detección de ventana T-lead. */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export default function OrderCard({ item, isSelected, isNew, isEscalated, onClick }: BoardCardRenderProps<OrderItem>) {
  const mode = MODE_CONFIG[item.orderMode || 'takeaway'] || MODE_CONFIG.takeaway
  const ModeIcon = mode.icon
  const statusColor = STATUS_COLORS[item.status] || 'bg-zinc-400'
  const computedElapsed = useElapsed(item.createdAt)
  const now = useNow()

  const isScheduled = item.orderTiming === 'scheduled' && !!item.scheduledPickupAt
  // Sin printNotBefore (orden vieja / sede sin config) se usa el retiro crudo
  // como umbral de emergencia — mejor una alerta tarde que ninguna.
  const printThreshold = item.printNotBefore ?? item.scheduledPickupAt
  // Estado T-lead: ya es hora de preparar/imprimir el pedido programado.
  const isDueSoon = isScheduled && !!printThreshold && new Date(printThreshold).getTime() <= now

  const timeLabel = isScheduled
    ? new Date(item.scheduledPickupAt!).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : computedElapsed

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-xl border p-3 transition-all duration-150 hover:shadow-md group/card',
        // Tinte indigo propio del pedido programado (futuro)
        isScheduled && !isDueSoon && !isEscalated && 'border-indigo-300 bg-indigo-50/50 hover:border-indigo-400',
        // Estado T-lead: ámbar + pulso — es hora de actuar
        isScheduled && isDueSoon && !isEscalated && 'border-amber-400 bg-amber-50/70 ring-1 ring-amber-400/60 animate-pulse',
        isEscalated && 'ring-2 ring-red-400/70 shadow-red-100 shadow-lg animate-pulse',
        !isEscalated && isNew && !isDueSoon && 'ring-2 ring-emerald-400/50 shadow-emerald-100 shadow-lg animate-pulse',
        isSelected
          ? 'border-primary bg-primary/5 shadow-md'
          : !isScheduled && 'border-border/60 bg-card hover:border-primary/30'
      )}
    >
      {/* Header: Order # + Time */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-black text-sm tracking-tight text-foreground">
            #{item.orderNumber}
          </span>
          <span className={cn('w-2 h-2 rounded-full shrink-0', statusColor)} />
        </div>
        <span className={cn(
          'flex items-center gap-1 text-[10px] font-medium tabular-nums',
          isScheduled ? 'text-indigo-600 font-bold' : 'text-muted-foreground'
        )}>
          {isScheduled ? <AlarmClock size={11} /> : <Clock size={10} />}
          {timeLabel}
        </span>
      </div>

      {/* Customer name */}
      <p className="text-xs font-semibold text-foreground truncate mb-1.5">
        {item.customer.name}
      </p>

      {/* Bottom: Mode + Amount + Location */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase', mode.bg, mode.color)}>
            <ModeIcon size={10} />
            {item.orderMode}
          </span>
          {item.payment?.method === 'cash' && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
              💵 EFECTIVO
            </span>
          )}
          {item.locationName && (
            <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
              <MapPin size={8} />
              {item.locationName}
            </span>
          )}
        </div>
        <span className="font-black text-xs text-primary tabular-nums">
          ${toPesos(item.total).toLocaleString('es-AR')}
        </span>
      </div>

      {/* Scheduled: badge indigo con countdown vivo hasta el retiro */}
      {isScheduled && !isDueSoon && (
        <div className="mt-2 flex items-center justify-between px-1.5 py-1 rounded-md bg-indigo-100/80 text-indigo-700 text-[9px] font-bold border border-indigo-200">
          <span className="flex items-center gap-1">
            <AlarmClock size={9} />
            PROGRAMADO {new Date(item.scheduledPickupAt!).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="flex items-center gap-0.5 tabular-nums text-indigo-500">
            <Timer size={9} />
            en {getCountdown(item.scheduledPickupAt!, now)}
          </span>
        </div>
      )}

      {/* T-lead alcanzado: es hora de preparar/imprimir */}
      {isScheduled && isDueSoon && (
        <div className="mt-2 flex items-center justify-between px-1.5 py-1 rounded-md bg-amber-200/80 text-amber-900 text-[9px] font-extrabold border border-amber-400 animate-pulse">
          <span className="flex items-center gap-1">
            <AlarmClock size={9} />
            ¡PREPARAR AHORA! Retiro {new Date(item.scheduledPickupAt!).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="flex items-center gap-0.5 tabular-nums">
            <Timer size={9} />
            {getCountdown(item.scheduledPickupAt!, now) === '¡ya!' ? 'retirando' : `en ${getCountdown(item.scheduledPickupAt!, now)}`}
          </span>
        </div>
      )}

      {/* Escalated: "Sin atender" badge */}
      {isEscalated && (
        <div className="mt-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-[9px] font-bold animate-pulse">
          <Clock size={8} />
          Sin atender · {computedElapsed}
        </div>
      )}
    </button>
  )
}
