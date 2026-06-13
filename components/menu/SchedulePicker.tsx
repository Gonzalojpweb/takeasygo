'use client'

import { useState, useEffect, useCallback } from 'react'
import { Clock, Calendar, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'

interface AvailableSlot {
  time: string
  available: boolean
  ordersCount: number
}

interface SchedulePickerProps {
  tenantSlug: string
  locationId: string
  maxAdvanceHours?: number
  onSelect: (scheduledPickupAt: string) => void
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export default function SchedulePicker({ tenantSlug, locationId, maxAdvanceHours, onSelect }: SchedulePickerProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [slots, setSlots] = useState<AvailableSlot[]>([])
  const [dayOpen, setDayOpen] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchSlots = useCallback(async (dateStr: string) => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/${tenantSlug}/locations/${locationId}/scheduled-slots?date=${dateStr}`
      )
      if (!res.ok) {
        setSlots([])
        setDayOpen(false)
        return
      }
      const data = await res.json()
      setSlots(data.slots || [])
      setDayOpen(data.dayOpen)
    } catch {
      setSlots([])
      setDayOpen(false)
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, locationId])

  const handleDateSelect = (dateStr: string) => {
    setSelectedDate(dateStr)
    setSelectedTime(null)
    fetchSlots(dateStr)
  }

  const handleTimeSelect = (time: string) => {
    if (!selectedDate) return
    setSelectedTime(time)
    const [hours, minutes] = time.split(':').map(Number)
    const date = new Date(selectedDate + 'T00:00:00')
    date.setHours(hours, minutes, 0, 0)
    onSelect(date.toISOString())
  }

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay()
  }

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const advanceHours = maxAdvanceHours ?? 24
  const maxDate = new Date(today.getTime() + advanceHours * 60 * 60 * 1000)
  const maxDateStr = maxDate.toISOString().split('T')[0]

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

  const days: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)

  const isDateDisabled = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const date = new Date(dateStr + 'T00:00:00')
    return date < new Date(todayStr + 'T00:00:00') || dateStr > maxDateStr
  }

  const isDateSelected = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return selectedDate === dateStr
  }

  return (
    <div className="space-y-4">
      {/* Info text */}
      <p className="text-[11px] text-zinc-500 leading-tight px-1">
        Podés programar hasta {advanceHours === 1 ? '1 hora' : `${advanceHours} horas`} antes
      </p>

      {/* Calendar */}
      <div className="bg-zinc-50 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4">
          <button type="button" onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-zinc-200 transition-colors">
            <ChevronLeft size={18} className="text-zinc-600" />
          </button>
          <span className="font-semibold text-sm">
            {MONTH_NAMES[month]} {year}
          </span>
          <button type="button" onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-zinc-200 transition-colors">
            <ChevronRight size={18} className="text-zinc-600" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {DAY_NAMES.map(day => (
            <div key={day} className="text-center text-[10px] font-bold text-zinc-400 uppercase py-1">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((day, idx) => {
            if (day === null) return <div key={`empty-${idx}`} />
            const disabled = isDateDisabled(day)
            const selected = isDateSelected(day)
            const isToday = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` === todayStr

            return (
              <button
                key={idx}
                type="button"
                disabled={disabled}
                onClick={() => handleDateSelect(
                  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                )}
                className={`
                  h-9 rounded-lg text-sm font-medium transition-all
                  ${selected
                    ? 'bg-zinc-900 text-white'
                    : disabled
                      ? 'text-zinc-300 cursor-not-allowed'
                      : isToday
                        ? 'ring-2 ring-zinc-400 text-zinc-900 hover:bg-zinc-200'
                        : 'text-zinc-700 hover:bg-zinc-200'
                  }
                `}
              >
                {day}
              </button>
            )
          })}
        </div>
      </div>

      {/* Time Slots */}
      {selectedDate && (
        <div className="bg-zinc-50 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-zinc-500" />
            <span className="font-semibold text-sm">Horarios disponibles</span>
          </div>

          {loading ? (
            <div className="py-6 text-center">
              <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin mx-auto" />
            </div>
          ) : !dayOpen ? (
            <div className="flex items-center gap-2 py-4 text-center text-sm text-zinc-500">
              <AlertCircle size={16} />
              <span>Este día el local está cerrado. Elegí otra fecha.</span>
            </div>
          ) : slots.length === 0 ? (
            <div className="py-4 text-center text-sm text-zinc-500">
              Todos los turnos disponibles para este día ya están ocupados. Probá con otra fecha.
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {slots.map(slot => (
                <button
                  key={slot.time}
                  type="button"
                  disabled={!slot.available}
                  onClick={() => handleTimeSelect(slot.time)}
                  className={`
                    py-2 px-3 rounded-xl text-xs font-semibold transition-all
                    ${selectedTime === slot.time
                      ? 'bg-zinc-900 text-white'
                      : slot.available
                        ? 'bg-white border border-zinc-200 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-100'
                        : 'bg-zinc-100 text-zinc-300 cursor-not-allowed'
                    }
                  `}
                >
                  {slot.time}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selection Summary */}
      {selectedDate && selectedTime && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900 text-white">
          <Calendar size={16} />
          <span className="text-sm font-medium">
            {formatDateReadable(selectedDate)} a las {selectedTime} hs
          </span>
        </div>
      )}
    </div>
  )
}

function formatDateReadable(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  const day = date.getDate()
  const month = MONTH_NAMES[date.getMonth()].slice(0, 3)
  const dayName = DAY_NAMES[date.getDay()]
  return `${dayName} ${day} ${month}`
}
