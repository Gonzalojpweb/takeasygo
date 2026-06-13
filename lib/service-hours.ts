export type ServiceSlot = { days: number[]; open: string; close: string }
export type ServiceHoursMode = 'takeaway' | 'dineIn' | 'delivery'

export type ServiceHoursMap = {
  takeaway: ServiceSlot[]
  dineIn: ServiceSlot[]
  delivery: ServiceSlot[]
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/**
 * Evalúa si un restaurante está abierto ahora para un modo dado.
 * Si no se especifica modo, chequea takeaway. Retorna null si no hay horarios.
 */
export function checkIsOpenNow(
  serviceHours?: Partial<ServiceHoursMap>,
  mode?: ServiceHoursMode
): boolean | null {
  const m = mode || 'takeaway'
  const slots = serviceHours?.[m]
  if (!slots?.length) return null
  const now = new Date()
  const day = now.getDay()
  const cur = now.getHours() * 100 + now.getMinutes()
  return slots.some(slot => {
    if (!slot.days.includes(day)) return false
    const [oh, om] = slot.open.split(':').map(Number)
    const [ch, cm] = slot.close.split(':').map(Number)
    return cur >= oh * 100 + om && cur <= ch * 100 + cm
  })
}

/**
 * Versión legacy: chequea takeaway solamente.
 */
export function checkIsOpenNowTakeaway(
  serviceHours?: { takeaway: ServiceSlot[] }
): boolean | null {
  return checkIsOpenNow(serviceHours, 'takeaway')
}

export function getClosingTime(serviceHours?: { takeaway: ServiceSlot[] }): string | null {
  if (!serviceHours?.takeaway?.length) return null
  const now = new Date()
  const day = now.getDay()
  const cur = now.getHours() * 100 + now.getMinutes()
  let closest: string | null = null
  let closestDiff = Infinity
  for (const slot of serviceHours.takeaway) {
    if (!slot.days.includes(day)) continue
    const [oh, om] = slot.open.split(':').map(Number)
    const [ch, cm] = slot.close.split(':').map(Number)
    const openVal = oh * 100 + om
    const closeVal = ch * 100 + cm
    if (cur >= openVal && cur <= closeVal) {
      const diff = closeVal - cur
      if (diff < closestDiff) {
        closestDiff = diff
        closest = slot.close
      }
    }
  }
  return closest
}

export function getNextOpenTime(serviceHours?: { takeaway: ServiceSlot[] }): string | null {
  if (!serviceHours?.takeaway?.length) return null
  const now = new Date()
  const day = now.getDay()
  const cur = now.getHours() * 100 + now.getMinutes()

  for (let offset = 0; offset < 7; offset++) {
    const checkDay = (day + offset) % 7
    for (const slot of serviceHours.takeaway) {
      if (!slot.days.includes(checkDay)) continue
      const [oh, om] = slot.open.split(':').map(Number)
      const openVal = oh * 100 + om
      if (offset === 0 && openVal <= cur) continue
      if (offset === 0) {
        const [ch, cm] = slot.close.split(':').map(Number)
        if (cur > ch * 100 + cm) continue
      }
      const dayName = offset === 0 ? 'hoy' : offset === 1 ? 'mañana' : DAY_NAMES[checkDay]
      return offset === 0 ? slot.open : `${dayName} ${slot.open}`
    }
  }
  return null
}

export function formatWeeklySchedule(serviceHours?: { takeaway: ServiceSlot[] }): { day: string; hours: string; isToday: boolean }[] {
  if (!serviceHours?.takeaway?.length) return []
  const today = new Date().getDay()
  const schedule: { day: string; hours: string; isToday: boolean }[] = []

  for (let i = 0; i < 7; i++) {
    const slotsForDay = serviceHours.takeaway.filter(s => s.days.includes(i))
    const dayName = DAY_NAMES[i]
    const hours = slotsForDay
      .map(s => `${s.open} - ${s.close}`)
      .join(', ')
    schedule.push({
      day: dayName,
      hours: hours || 'Cerrado',
      isToday: i === today,
    })
  }

  return schedule
}

export { DAY_NAMES }
