export type AvailabilitySlot = { days: number[]; timeStart: string; timeEnd: string }

/**
 * Returns true if the current time falls within any of the schedule slots.
 * If mode is 'always' or undefined, always returns true.
 */
export function isAvailableNow(
  mode: 'always' | 'scheduled' | undefined,
  schedule: AvailabilitySlot[] | undefined
): boolean {
  if (!mode || mode === 'always') return true
  if (!schedule?.length) return false

  const now = new Date()
  const day = now.getDay() // 0=Sun
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  return schedule.some(slot => {
    if (!slot.days.includes(day)) return false
    const [startH, startM] = slot.timeStart.split(':').map(Number)
    const [endH, endM] = slot.timeEnd.split(':').map(Number)
    const startMinutes = startH * 60 + startM
    const endMinutes = endH * 60 + endM
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes
  })
}

export type ServiceSlot = { days: number[]; open: string; close: string }

/**
 * Returns true if the service is open right now based on the given slots.
 * If no slots are configured, assumes always open.
 */
export function isServiceOpen(slots: ServiceSlot[] | undefined): boolean {
  if (!slots?.length) return true // if not configured, assume always open
  const now = new Date()
  const day = now.getDay()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  return slots.some(slot => {
    if (!slot.days.includes(day)) return false
    const [openH, openM] = slot.open.split(':').map(Number)
    const [closeH, closeM] = slot.close.split(':').map(Number)
    return currentMinutes >= openH * 60 + openM && currentMinutes <= closeH * 60 + closeM
  })
}
