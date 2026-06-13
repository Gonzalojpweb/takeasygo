import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import type { ILocation } from '@/models/Location'
import type { AvailabilitySlot } from '@/lib/availability'
import { getDayAndMidnightInTimezone, getLocalDayAndMinutes } from '@/lib/restaurant-time'

type ServiceSlot = { days: number[]; open: string; close: string }
type ServiceHoursMode = 'takeaway' | 'dineIn' | 'delivery'

type ServiceHoursMap = {
  takeaway: ServiceSlot[]
  dineIn: ServiceSlot[]
  delivery: ServiceSlot[]
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function getSlotsForMode(
  serviceHours: ServiceHoursMap | undefined,
  mode: ServiceHoursMode
): ServiceSlot[] {
  if (!serviceHours?.[mode]?.length) return []
  return serviceHours[mode]
}

function isDayOpen(
  serviceHours: ServiceHoursMap | undefined,
  mode: ServiceHoursMode,
  dayOfWeek: number
): boolean {
  const slots = getSlotsForMode(serviceHours, mode)
  if (!slots.length) return false
  return slots.some(slot => slot.days.includes(dayOfWeek))
}

function isTimeWithinServiceHours(
  serviceHours: ServiceHoursMap | undefined,
  mode: ServiceHoursMode,
  dayOfWeek: number,
  minutes: number
): boolean {
  const slots = getSlotsForMode(serviceHours, mode)
  if (!slots.length) return false
  return slots.some(slot => {
    if (!slot.days.includes(dayOfWeek)) return false
    const openMin = timeToMinutes(slot.open)
    const closeMin = timeToMinutes(slot.close)
    return minutes >= openMin && minutes <= closeMin
  })
}

function getEffectiveServiceHours(
  serviceHours: ServiceHoursMap | undefined,
  mode: ServiceHoursMode
): ServiceSlot[] {
  return getSlotsForMode(serviceHours, mode)
}

function isItemAvailableAtTime(
  itemAvailabilityMode: 'always' | 'scheduled' | undefined,
  itemSchedule: AvailabilitySlot[] | undefined,
  dayOfWeek: number,
  minutes: number
): boolean {
  if (!itemAvailabilityMode || itemAvailabilityMode === 'always') return true
  if (!itemSchedule?.length) return false
  return itemSchedule.some(slot => {
    if (!slot.days.includes(dayOfWeek)) return false
    const startMin = timeToMinutes(slot.timeStart)
    const endMin = timeToMinutes(slot.timeEnd)
    return minutes >= startMin && minutes <= endMin
  })
}

export interface ScheduledOrderValidation {
  valid: boolean
  error?: string
}

export async function validateScheduledPickupTime(
  locationId: string,
  scheduledPickupAt: Date,
  menuItems?: Array<{
    availabilityMode: 'always' | 'scheduled' | undefined
    availabilitySchedule: AvailabilitySlot[] | undefined
  }>,
  orderMode?: ServiceHoursMode,
  timezone?: string
): Promise<ScheduledOrderValidation> {
  await connectDB()

  const location = await Location.findById(locationId).lean() as ILocation | null
  if (!location) {
    return { valid: false, error: 'Sede no encontrada' }
  }

  const tz = timezone || location.timezone || 'America/Argentina/Buenos_Aires'

  const config = location.scheduledOrdersConfig
  if (!config?.enabled) {
    return { valid: false, error: 'Los pedidos programados no están habilitados en esta sede' }
  }

  const now = new Date()
  const scheduled = new Date(scheduledPickupAt)

  if (scheduled <= now) {
    return { valid: false, error: 'La fecha programada debe ser en el futuro' }
  }

  const diffMinutes = (scheduled.getTime() - now.getTime()) / (1000 * 60)

  if (diffMinutes < config.minAdvanceMinutes) {
    return {
      valid: false,
      error: `Debés programar con al menos ${config.minAdvanceMinutes} minutos de anticipación`,
    }
  }

  const maxAdvanceMs = config.maxAdvanceHours * 60 * 60 * 1000
  if (scheduled.getTime() - now.getTime() > maxAdvanceMs) {
    return {
      valid: false,
      error: `Solo podés programar hasta ${config.maxAdvanceHours} horas adelante`,
    }
  }

  const { day: dayOfWeek, minutes } = getLocalDayAndMinutes(scheduled, tz)
  const mode = orderMode === 'delivery' ? 'delivery' as ServiceHoursMode : 'takeaway' as ServiceHoursMode

  if (!isDayOpen(location.serviceHours, mode, dayOfWeek)) {
    return { valid: false, error: 'El local está cerrado en ese día' }
  }

  if (!isTimeWithinServiceHours(location.serviceHours, mode, dayOfWeek, minutes)) {
    return { valid: false, error: 'El horario seleccionado está fuera del horario de atención' }
  }

  if (menuItems && menuItems.length > 0) {
    for (const item of menuItems) {
      if (!isItemAvailableAtTime(item.availabilityMode, item.availabilitySchedule, dayOfWeek, minutes)) {
        return { valid: false, error: 'Uno o más items no están disponibles en el horario seleccionado' }
      }
    }
  }

  const slotStart = new Date(scheduled)
  slotStart.setMinutes(Math.floor(slotStart.getMinutes() / config.slotDurationMinutes) * config.slotDurationMinutes, 0, 0)
  const slotEnd = new Date(slotStart)
  slotEnd.setMinutes(slotEnd.getMinutes() + config.slotDurationMinutes)

  const ordersInSlot = await Order.countDocuments({
    locationId,
    scheduledPickupAt: { $gte: slotStart, $lt: slotEnd },
    status: { $in: ['awaiting_payment', 'confirmed', 'preparing', 'ready', 'pending'] },
    scheduledStatus: { $in: ['pending_schedule', 'active', null] },
  })

  if (config.maxOrdersPerSlot > 0 && ordersInSlot >= config.maxOrdersPerSlot) {
    return { valid: false, error: 'No hay disponibilidad en ese horario. Elegí otro.' }
  }

  return { valid: true }
}

export interface AvailableSlot {
  time: string
  available: boolean
  ordersCount: number
}

export interface AvailableSlotsResult {
  date: string
  dayOpen: boolean
  slots: AvailableSlot[]
}

export async function getAvailableSlotsForDate(
  locationId: string,
  dateStr: string,
  orderMode?: ServiceHoursMode,
  timezone?: string
): Promise<AvailableSlotsResult> {
  await connectDB()

  const location = await Location.findById(locationId).lean() as ILocation | null
  if (!location) {
    return { date: dateStr, dayOpen: false, slots: [] }
  }

  const tz = timezone || location.timezone || 'America/Argentina/Buenos_Aires'

  const config = location.scheduledOrdersConfig
  if (!config?.enabled) {
    return { date: dateStr, dayOpen: false, slots: [] }
  }

  const { date: targetDate, day: dayOfWeek } = getDayAndMidnightInTimezone(dateStr, tz)
  const mode = orderMode === 'delivery' ? 'delivery' : 'takeaway'

  if (!isDayOpen(location.serviceHours, mode, dayOfWeek)) {
    return { date: dateStr, dayOpen: false, slots: [] }
  }

  const now = new Date()
  const minAdvance = new Date(now.getTime() + config.minAdvanceMinutes * 60 * 1000)
  const maxAdvance = new Date(now.getTime() + config.maxAdvanceHours * 60 * 60 * 1000)

  const seen = new Set<string>()
  const slots: AvailableSlot[] = []
  const effectiveHours = getEffectiveServiceHours(location.serviceHours, mode)

  for (const slot of effectiveHours) {
    if (!slot.days.includes(dayOfWeek)) continue

    const openMin = timeToMinutes(slot.open)
    const closeMin = timeToMinutes(slot.close)

    for (let min = openMin; min < closeMin; min += config.slotDurationMinutes) {
      const slotDate = new Date(targetDate)
      slotDate.setHours(Math.floor(min / 60), min % 60, 0, 0)

      if (slotDate < minAdvance) continue
      if (slotDate > maxAdvance) continue

      const timeKey = `${Math.floor(min / 60).toString().padStart(2, '0')}:${(min % 60).toString().padStart(2, '0')}`
      if (seen.has(timeKey)) continue
      seen.add(timeKey)

      const slotEnd = new Date(slotDate)
      slotEnd.setMinutes(slotEnd.getMinutes() + config.slotDurationMinutes)

      const ordersCount = await Order.countDocuments({
        locationId,
        scheduledPickupAt: { $gte: slotDate, $lt: slotEnd },
        status: { $in: ['awaiting_payment', 'confirmed', 'preparing', 'ready', 'pending'] },
        scheduledStatus: { $in: ['pending_schedule', 'active', null] },
      })

      const available = config.maxOrdersPerSlot === 0 || ordersCount < config.maxOrdersPerSlot

      slots.push({
        time: timeKey,
        available,
        ordersCount,
      })
    }
  }

  slots.sort((a, b) => a.time.localeCompare(b.time))

  return { date: dateStr, dayOpen: true, slots }
}

export async function activateScheduledOrders(): Promise<{ activated: number; expired: number }> {
  await connectDB()

  const now = new Date()

  const locations = await Location.find({ 'scheduledOrdersConfig.enabled': true }).lean() as ILocation[]

  let activated = 0
  let expired = 0

  for (const location of locations) {
    const gracePeriod = location.scheduledOrdersConfig?.gracePeriodMinutes ?? 15

    const toActivate = await Order.updateMany(
      {
        locationId: location._id,
        orderTiming: 'scheduled',
        scheduledStatus: 'pending_schedule',
        scheduledPickupAt: { $lte: now },
        status: { $in: ['awaiting_payment', 'confirmed'] },
      },
      {
        $set: { scheduledStatus: 'active' },
      }
    )
    activated += toActivate.modifiedCount

    const toExpire = await Order.updateMany(
      {
        locationId: location._id,
        orderTiming: 'scheduled',
        scheduledStatus: 'pending_schedule',
        scheduledPickupAt: { $lt: new Date(now.getTime() - gracePeriod * 60 * 1000) },
        status: { $in: ['awaiting_payment', 'confirmed'] },
      },
      {
        $set: { scheduledStatus: 'expired' },
      }
    )
    expired += toExpire.modifiedCount
  }

  return { activated, expired }
}
