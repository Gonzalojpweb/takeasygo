import { connectDB } from '@/lib/mongoose'
import Reservation from '@/models/Reservation'
import type { ILocation } from '@/models/Location'
import {
  ACTIVE_RESERVATION_STATUSES,
  getDayCapacity,
  getMaxSpaceCapacity,
  isSpacesMode,
  occupiedSeatsForSpace,
  overlappingReservations,
  type ReservationSpace,
} from '@/lib/space-capacity'
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
  /** Sin espacios: nº de reservas. Con espacios: comensales ocupados (del día, o del espacio elegido). */
  currentReservations: number
  /** Sin espacios: maxReservationsPerSlot. Con espacios: capacidad (del día, o del espacio elegido). */
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
  /** Espacios de la sede. Vacío/ausente = modo clásico por maxReservationsPerSlot. */
  spaces?: ReservationSpace[] | null
  /** Tamaño del grupo que pregunta. En modo espacios define si entra en el aforo. */
  partySize?: number
  /**
   * Espacio elegido por el cliente. Si se pasa, la disponibilidad de cada
   * horario se mide contra la capacidad de ESE espacio, no contra la total.
   */
  spaceId?: string | null
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
  const autoMode = !!slotConfig?.enabled && !!slotConfig?.operatingHours?.length
  const blockDuration = slotConfig?.blockDurationMinutes || 90
  const maxPerSlot = slotConfig?.maxReservationsPerSlot || 1

  const candidateSlots: string[] = []
  if (!autoMode) {
    for (const time of reservationConfig?.timeSlots || []) {
      if (bookable(time)) candidateSlots.push(time)
    }
    if (!candidateSlots.length) return EMPTY_RESULT(dateStr)
  } else {
    const dayOfWeek = getDayAndMidnightInTimezone(dateStr, timezone).day
    const matchingHours = slotConfig.operatingHours.filter(h =>
      h.days.includes(dayOfWeek)
    )
    if (matchingHours.length === 0) return EMPTY_RESULT(dateStr)

    const interval = slotConfig.slotIntervalMinutes || 30
    for (const hours of matchingHours) {
      const openMin = timeToMinutes(hours.open)
      const closeMin = timeToMinutes(hours.close)
      for (let min = openMin; min < closeMin; min += interval) {
        const time = minutesToTime(min)
        if (bookable(time)) candidateSlots.push(time)
      }
    }
    if (!candidateSlots.length) return EMPTY_RESULT(dateStr)
  }

  const spacesMode = isSpacesMode(opts.spaces)
  const partySize = opts.partySize ?? 1

  // Espacio elegido por el cliente: capacidad individual y ocupación solo de
  // las reservas que apuntan a ese espacio.
  const spaceId = opts.spaceId ?? null
  const chosenSpace = spaceId
    ? (opts.spaces ?? []).find(s => s._id != null && String(s._id) === spaceId) ?? null
    : null
  const chosenSpaceActive =
    !!chosenSpace &&
    chosenSpace.enabled !== false &&
    !(chosenSpace.blockedDates ?? []).includes(dateStr)
  const chosenSpaceCapacity = chosenSpaceActive ? chosenSpace!.capacity || 0 : 0

  let existingReservations: Array<{ time: string; partySize: number; spaceId?: unknown }> = []
  if (autoMode || spacesMode) {
    await connectDB()
    existingReservations = await Reservation.find({
      locationId,
      date: dateStr,
      status: { $in: [...ACTIVE_RESERVATION_STATUSES] },
    }).lean()
  }

  const dayCapacity = spacesMode ? getDayCapacity(opts.spaces, dateStr) : 0
  const maxSpaceCapacity = spacesMode ? getMaxSpaceCapacity(opts.spaces, dateStr) : 0

  const slots: AvailableReservationSlot[] = candidateSlots.map(time => {
    const overlapping = overlappingReservations(existingReservations, time, blockDuration)

    if (spacesMode) {
      if (spaceId) {
        const occupied = occupiedSeatsForSpace(existingReservations, spaceId, time, blockDuration)
        return {
          time,
          available:
            chosenSpaceActive &&
            partySize <= chosenSpaceCapacity &&
            chosenSpaceCapacity - occupied >= partySize,
          currentReservations: occupied,
          maxReservations: chosenSpaceCapacity,
        }
      }
      const occupied = overlapping.reduce((sum, r) => sum + (r.partySize || 0), 0)
      return {
        time,
        available: partySize <= maxSpaceCapacity && dayCapacity - occupied >= partySize,
        currentReservations: occupied,
        maxReservations: dayCapacity,
      }
    }

    return {
      time,
      available: overlapping.length < maxPerSlot,
      currentReservations: overlapping.length,
      maxReservations: maxPerSlot,
    }
  })

  return { date: dateStr, dayOpen: true, slots }
}
