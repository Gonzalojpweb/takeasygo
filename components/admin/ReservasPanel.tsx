'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  CalendarDays,
  Users,
  Clock,
  MapPin,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  UserCheck,
  UserX,
  Loader2,
  StickyNote,
  Phone,
} from 'lucide-react'

interface Reservation {
  _id: string
  reservationNumber: string
  date: string
  time: string
  partySize: number
  name: string
  phone: string
  notes: string
  status: 'pending_payment' | 'confirmed' | 'cancelled' | 'seated' | 'no_show'
  locationId: string
  payment: {
    amount: number
    status: 'pending' | 'approved' | 'rejected'
  }
}

interface Location {
  _id: string
  name: string
}

interface Props {
  reservations: Reservation[]
  locations: Location[]
  tenantSlug: string
}

const STATUS_CONFIG = {
  pending_payment: { label: 'Pago pendiente', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  confirmed:       { label: 'Confirmada',     color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  cancelled:       { label: 'Cancelada',      color: 'bg-red-500/10 text-red-600 border-red-500/20' },
  seated:          { label: 'En mesa',        color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  no_show:         { label: 'No se presentó', color: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' },
}

function formatDateLabel(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (date.getTime() === today.getTime()) return 'Hoy'
  if (date.getTime() === tomorrow.getTime()) return 'Mañana'
  if (date.getTime() === yesterday.getTime()) return 'Ayer'

  return date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

function getDatesInRange(from: Date, to: Date): string[] {
  const dates: string[] = []
  const cur = new Date(from)
  while (cur <= to) {
    dates.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

export default function ReservasPanel({ reservations: initialReservations, locations, tenantSlug }: Props) {
  const router = useRouter()
  const [reservations, setReservations] = useState<Reservation[]>(initialReservations)
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0])
  const [selectedLocation, setSelectedLocation] = useState<string>('all')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // Date navigation — show 14 days from today
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weekFrom = new Date(today)
  weekFrom.setDate(today.getDate() - 2)
  const weekTo = new Date(today)
  weekTo.setDate(today.getDate() + 14)
  const dateRange = getDatesInRange(weekFrom, weekTo)

  const filtered = useMemo(() => {
    return reservations.filter(r => {
      const dateOk = r.date === selectedDate
      const locOk = selectedLocation === 'all' || r.locationId === selectedLocation
      return dateOk && locOk
    })
  }, [reservations, selectedDate, selectedLocation])

  // Count per date for dots
  const countByDate = useMemo(() => {
    const map: Record<string, number> = {}
    reservations.forEach(r => {
      if (selectedLocation === 'all' || r.locationId === selectedLocation) {
        map[r.date] = (map[r.date] || 0) + 1
      }
    })
    return map
  }, [reservations, selectedLocation])

  async function updateStatus(reservaId: string, status: Reservation['status']) {
    setUpdatingId(reservaId)
    try {
      const res = await fetch(`/api/${tenantSlug}/reservas/${reservaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      setReservations(prev =>
        prev.map(r => r._id === reservaId ? { ...r, status } : r)
      )
      toast.success('Estado actualizado')
      router.refresh()
    } catch {
      toast.error('Error al actualizar estado')
    } finally {
      setUpdatingId(null)
    }
  }

  const locationName = (id: string) => locations.find(l => l._id === id)?.name || 'Sede'

  return (
    <div className="space-y-6">
      {/* Location filter */}
      {locations.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedLocation('all')}
            className={cn(
              'px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border',
              selectedLocation === 'all'
                ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                : 'border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'
            )}
          >
            Todas las sedes
          </button>
          {locations.map(loc => (
            <button
              key={loc._id}
              onClick={() => setSelectedLocation(loc._id)}
              className={cn(
                'px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border',
                selectedLocation === loc._id
                  ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                  : 'border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              {loc.name}
            </button>
          ))}
        </div>
      )}

      {/* Date selector */}
      <div className="relative">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          {dateRange.map(date => {
            const count = countByDate[date] || 0
            const isToday = date === new Date().toISOString().split('T')[0]
            const isSelected = date === selectedDate
            const [, month, day] = date.split('-')
            const dayObj = new Date(parseInt(date.split('-')[0]), parseInt(month) - 1, parseInt(day))
            const dayName = dayObj.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')

            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={cn(
                  'flex flex-col items-center gap-1 min-w-[54px] py-3 px-2 rounded-2xl border transition-all shrink-0',
                  isSelected
                    ? 'bg-primary text-white border-primary shadow-xl shadow-primary/25'
                    : isToday
                    ? 'border-primary/40 bg-primary/5 text-foreground'
                    : 'border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                )}
              >
                <span className={cn('text-[9px] font-black uppercase tracking-widest', isSelected ? 'text-white/70' : 'text-muted-foreground/60')}>
                  {dayName}
                </span>
                <span className="text-lg font-black leading-none">{day}</span>
                {count > 0 ? (
                  <span className={cn(
                    'text-[9px] font-black px-1.5 py-0.5 rounded-full',
                    isSelected ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'
                  )}>
                    {count}
                  </span>
                ) : (
                  <span className="w-4 h-1" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Header for selected date */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight capitalize">{formatDateLabel(selectedDate)}</h2>
          <p className="text-xs text-muted-foreground font-medium mt-0.5">
            {filtered.length === 0 ? 'Sin reservas' : `${filtered.length} reserva${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Reservation list */}
      {filtered.length === 0 ? (
        <Card className="border-2 border-dashed border-border/50 rounded-[2rem]">
          <CardContent className="py-16 text-center">
            <CalendarDays size={32} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-bold text-sm">Sin reservas para este día</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered
            .sort((a, b) => a.time.localeCompare(b.time))
            .map(r => {
              const cfg = STATUS_CONFIG[r.status]
              const isUpdating = updatingId === r._id
              return (
                <Card key={r._id} className={cn(
                  'border-2 rounded-[1.5rem] transition-all overflow-hidden',
                  r.status === 'cancelled' || r.status === 'no_show'
                    ? 'border-border/40 opacity-60'
                    : 'border-border/60 hover:border-primary/30 shadow-sm'
                )}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      {/* Time block */}
                      <div className="shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-muted/50 border border-border/40">
                        <Clock size={12} className="text-primary mb-0.5" />
                        <span className="text-base font-black leading-tight">{r.time}</span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-base tracking-tight">{r.name}</span>
                          <span className="text-[10px] font-bold text-muted-foreground/50">#{r.reservationNumber}</span>
                          <span className={cn('text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border', cfg.color)}>
                            {cfg.label}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground font-medium">
                          <span className="flex items-center gap-1">
                            <Users size={11} className="text-primary" />
                            {r.partySize} {r.partySize === 1 ? 'persona' : 'personas'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Phone size={11} className="text-primary" />
                            {r.phone}
                          </span>
                          {locations.length > 1 && (
                            <span className="flex items-center gap-1">
                              <MapPin size={11} className="text-primary" />
                              {locationName(r.locationId)}
                            </span>
                          )}
                          {r.payment.amount > 0 && (
                            <span className={cn(
                              'flex items-center gap-1 font-bold',
                              r.payment.status === 'approved' ? 'text-emerald-600' : 'text-amber-600'
                            )}>
                              ${r.payment.amount.toLocaleString('es-AR')} {r.payment.status === 'approved' ? '✓' : '⏳'}
                            </span>
                          )}
                        </div>

                        {r.notes && (
                          <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
                            <StickyNote size={11} className="mt-0.5 shrink-0 text-primary" />
                            <span className="italic">{r.notes}</span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="shrink-0 flex flex-col gap-1.5">
                        {isUpdating ? (
                          <div className="w-8 h-8 flex items-center justify-center">
                            <Loader2 size={16} className="animate-spin text-primary" />
                          </div>
                        ) : (
                          <>
                            {r.status === 'pending_payment' && (
                              <ActionBtn
                                icon={<CheckCircle2 size={15} />}
                                label="Confirmar"
                                color="emerald"
                                onClick={() => updateStatus(r._id, 'confirmed')}
                              />
                            )}
                            {r.status === 'confirmed' && (
                              <>
                                <ActionBtn
                                  icon={<UserCheck size={15} />}
                                  label="En mesa"
                                  color="blue"
                                  onClick={() => updateStatus(r._id, 'seated')}
                                />
                                <ActionBtn
                                  icon={<UserX size={15} />}
                                  label="No vino"
                                  color="zinc"
                                  onClick={() => updateStatus(r._id, 'no_show')}
                                />
                              </>
                            )}
                            {(r.status === 'pending_payment' || r.status === 'confirmed') && (
                              <ActionBtn
                                icon={<XCircle size={15} />}
                                label="Cancelar"
                                color="red"
                                onClick={() => updateStatus(r._id, 'cancelled')}
                              />
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
        </div>
      )}
    </div>
  )
}

function ActionBtn({
  icon,
  label,
  color,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  color: 'emerald' | 'blue' | 'red' | 'zinc'
  onClick: () => void
}) {
  const colorMap = {
    emerald: 'text-emerald-600 hover:bg-emerald-50 border-emerald-200',
    blue:    'text-blue-600 hover:bg-blue-50 border-blue-200',
    red:     'text-red-600 hover:bg-red-50 border-red-200',
    zinc:    'text-zinc-500 hover:bg-zinc-50 border-zinc-200',
  }
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        'flex items-center justify-center w-8 h-8 rounded-xl border transition-all active:scale-95',
        colorMap[color]
      )}
    >
      {icon}
    </button>
  )
}
