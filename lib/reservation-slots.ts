import { connectDB } from '@/lib/mongoose'
import Reservation from '@/models/Reservation'
import Location from '@/models/Location'
import type { ILocation } from '@/models/Location'

type OperatingHour = { days: number[]; open: string; close: string }

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

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

export async function generateReservationSlots(
  locationId: string,
  dateStr: string,
  reservationConfig: ILocation['reservationConfig']
): Promise<AvailableReservationSlotsResult> {
  const slotConfig = reservationConfig?.slotConfig
  if (!slotConfig?.enabled || !slotConfig?.operatingHours?.length) {
    // Fallback to manual timeSlots if no slotConfig
    return {
      date: dateStr,
      dayOpen: true,
      slots: (reservationConfig?.timeSlots || []).map(time => ({
        time,
        available: true,
        currentReservations: 0,
        maxReservations: 1,
      })),
    }
  }

  await connectDB()

  const targetDate = new Date(dateStr + 'T00:00:00')
  const dayOfWeek = targetDate.getDay()

  const matchingHours = slotConfig.operatingHours.filter(h => h.days.includes(dayOfWeek))
  if (matchingHours.length === 0) {
    return { date: dateStr, dayOpen: false, slots: [] }
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
      candidateSlots.push(minutesToTime(min))
    }
  }

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
