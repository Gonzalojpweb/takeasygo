import { connectDB } from '@/lib/mongoose'
import Reservation from '@/models/Reservation'
import type { ILocation } from '@/models/Location'
import {
  DEFAULT_MIN_ADVANCE_MINUTES,
  DEFAULT_TIMEZONE,
  getDayAndMidnightInTimezone,
  getLocalDayAndMinutes,
  getTodayStrInTimezone,
  isSlotBookable,
  timeToMinutes,
} from '@/lib/restaurant-time'

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

export interface AvailableReservationSlot {
  time: string
  available: boolean
  currentReservations: number
  maxReservations: number
}

export interface AvailableReservationSlotsResult {
  date: string
  dayOpen: boolean
  slots: AvailableReservationSlot[]
}

export interface GenerateReservationSlotsOptions {
  timezone?: string
  minAdvanceMinutes?: number
  now?: Date
}

const EMPTY_RESULT = (date: string): AvailableReservationSlotsResult => ({
  date,
  dayOpen: false,
  slots: [],
})

export async function generateReservationSlots(
  locationId: string,
  dateStr: string,
  reservationConfig: ILocation['reservationConfig'],
  opts: GenerateReservationSlotsOptions = {}
): Promise<AvailableReservationSlotsResult> {
  const timezone = opts.timezone || DEFAULT_TIMEZONE
  const minAdvanceMinutes =
    opts.minAdvanceMinutes ??
    reservationConfig?.minAdvanceMinutes ??
    DEFAULT_MIN_ADVANCE_MINUTES
  const now = opts.now ?? new Date()

  const todayStr = getTodayStrInTimezone(timezone, now)
  if (dateStr < todayStr) return EMPTY_RESULT(dateStr)

  const isToday = dateStr === todayStr
  const nowMinutes = isToday ? getLocalDayAndMinutes(now, timezone).minutes : -1
  const bookable = (time: string) =>
    !isToday || isSlotBookable(timeToMinutes(time), nowMinutes, minAdvanceMinutes)

  const slotConfig = reservationConfig?.slotConfig
  if (!slotConfig?.enabled || !slotConfig?.operatingHours?.length) {
    // Fallback to manual timeSlots if no slotConfig
    const manualSlots = (reservationConfig?.timeSlots || []).filter(bookable)
    if (!manualSlots.length) return EMPTY_RESULT(dateStr)
    return {
      date: dateStr,
      dayOpen: true,
      slots: manualSlots.map(time => ({
        time,
        available: true,
        currentReservations: 0,
        maxReservations: 1,
      })),
    }
  }

  await connectDB()

  const dayOfWeek = getDayAndMidnightInTimezone(dateStr, timezone).day

  const matchingHours = slotConfig.operatingHours.filter(h => h.days.includes(dayOfWeek))
  if (matchingHours.length === 0) {
    return EMPTY_RESULT(dateStr)
  }

  const interval = slotConfig.slotIntervalMinutes || 30
  const blockDuration = slotConfig.blockDurationMinutes || 90
  const maxPerSlot = slotConfig.maxReservationsPerSlot || 1

  // Collect all candidate slots
  const candidateSlots: string[] = []
  for (const hours of matchingHours) {
    const openMin = timeToMinutes(hours.open)
    const closeMin = timeToMinutes(hours.close)
    for (let min = openMin; min < closeMin; min += interval) {
      const time = minutesToTime(min)
      if (bookable(time)) candidateSlots.push(time)
    }
  }
  if (!candidateSlots.length) return EMPTY_RESULT(dateStr)

  // Fetch existing reservations for this date
  const existingReservations = await Reservation.find({
    locationId,
    date: dateStr,
    status: { $in: ['pending_payment', 'confirmed'] },
  }).lean()

  // For each candidate slot, count overlapping reservations
  const slots: AvailableReservationSlot[] = candidateSlots.map(time => {
    const slotStart = timeToMinutes(time)
    const slotEnd = slotStart + blockDuration

    const overlapping = existingReservations.filter(r => {
      const rStart = timeToMinutes(r.time || '00:00')
      const rEnd = rStart + blockDuration
      return rStart < slotEnd && rEnd > slotStart
    })

    return {
      time,
      available: overlapping.length < maxPerSlot,
      currentReservations: overlapping.length,
      maxReservations: maxPerSlot,
    }
  })

  return { date: dateStr, dayOpen: true, slots }
}
