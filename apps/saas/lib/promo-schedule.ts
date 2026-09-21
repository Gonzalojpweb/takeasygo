/**
 * Helpers de scheduling para promociones.
 *
 * Reutiliza el patrón `days: number[]` (0=Dom, 1=Lun, ..., 6=Sáb)
 * que ya existe en service-hours y ScheduleEditor.
 */

/** Labels de los días para UI */
export const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const

/** Todos los días de la semana */
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

/**
 * ¿La promo está activa el día de la semana indicado?
 * Si activeDays es null, undefined o vacío → se considera activa todos los días.
 */
export function isPromoActiveOnDay(activeDays: number[] | null | undefined, dayOfWeek: number): boolean {
  if (!activeDays || activeDays.length === 0) return true
  return activeDays.includes(dayOfWeek)
}

/**
 * ¿La promo está activa HOY? (usa la fecha/hora actual del servidor)
 */
export function isPromoActiveToday(activeDays: number[] | null | undefined): boolean {
  return isPromoActiveOnDay(activeDays, new Date().getDay())
}

/**
 * ¿La promo está dentro de la ventana horaria activa?
 * Si activeTimeStart/End son null → se considera activa todo el día.
 */
export function isPromoInTimeWindow(
  activeTimeStart: string | null | undefined,
  activeTimeEnd: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!activeTimeStart || !activeTimeEnd) return true

  const [startH, startM] = activeTimeStart.split(':').map(Number)
  const [endH, endM] = activeTimeEnd.split(':').map(Number)

  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const startMinutes = startH * 60 + (startM || 0)
  const endMinutes = endH * 60 + (endM || 0)

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes
}

/**
 * Evaluación completa de scheduling: fecha + día de semana + horario.
 * Retorna true si la promo debería estar activa ahora.
 */
export function isPromoScheduledNow(promo: {
  scheduledStart?: Date | null
  scheduledEnd?: Date | null
  activeDays?: number[] | null
  activeTimeStart?: string | null
  activeTimeEnd?: string | null
}): boolean {
  const now = new Date()

  // Rango de fechas
  if (promo.scheduledStart && now < promo.scheduledStart) return false
  if (promo.scheduledEnd && now > promo.scheduledEnd) return false

  // Día de la semana
  if (!isPromoActiveOnDay(promo.activeDays, now.getDay())) return false

  // Ventana horaria
  if (!isPromoInTimeWindow(promo.activeTimeStart, promo.activeTimeEnd, now)) return false

  return true
}
