/**
 * Helpers de scheduling para promociones.
 *
 * Reutiliza el patrón `days: number[]` (0=Dom, 1=Lun, ..., 6=Sáb)
 * que ya existe en service-hours y ScheduleEditor.
 *
 * Día y hora se evalúan en la ZONA HORARIA DE LA SEDE (por defecto Argentina),
 * nunca en la del servidor: Vercel corre en UTC y, a partir de las 21 h de
 * Argentina, el servidor creía que ya era el día siguiente y pasada la hora de
 * cierre → las promos desaparecían del menú y el checkout las rechazaba.
 * Una ventana que cruza la medianoche (20:00 → 02:00) también es válida.
 */

/** Labels de los días para UI */
export const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const

/** Todos los días de la semana */
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

/** Zona horaria por defecto (todas las sedes son de Argentina salvo que digan otra). */
export const DEFAULT_PROMO_TIMEZONE = 'America/Argentina/Buenos_Aires'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Día (0–6) y minuto del día en la zona horaria indicada. Zona inválida → Argentina. */
export function localDayMinutes(now: Date = new Date(), timeZone: string | null | undefined = DEFAULT_PROMO_TIMEZONE): { day: number; minutes: number } {
  const read = (tz: string) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
    return { day: WEEKDAYS.indexOf(get('weekday')), minutes: Number(get('hour')) * 60 + Number(get('minute')) }
  }
  try {
    return read(timeZone || DEFAULT_PROMO_TIMEZONE)
  } catch {
    return read(DEFAULT_PROMO_TIMEZONE)
  }
}

/**
 * ¿La promo está activa el día de la semana indicado?
 * Si activeDays es null, undefined o vacío → se considera activa todos los días.
 */
export function isPromoActiveOnDay(activeDays: number[] | null | undefined, dayOfWeek: number): boolean {
  if (!activeDays || activeDays.length === 0) return true
  return activeDays.includes(dayOfWeek)
}

/**
 * ¿La promo está activa HOY en la sede? (día de la semana en su zona horaria)
 */
export function isPromoActiveToday(
  activeDays: number[] | null | undefined,
  timeZone: string | null | undefined = DEFAULT_PROMO_TIMEZONE,
  now: Date = new Date(),
): boolean {
  return isPromoActiveOnDay(activeDays, localDayMinutes(now, timeZone).day)
}

const toMinutes = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * ¿La promo está dentro de la ventana horaria activa (hora de la sede)?
 * Si activeTimeStart/End son null → se considera activa todo el día.
 * Si el fin es menor que el inicio, la ventana cruza la medianoche.
 */
export function isPromoInTimeWindow(
  activeTimeStart: string | null | undefined,
  activeTimeEnd: string | null | undefined,
  now: Date = new Date(),
  timeZone: string | null | undefined = DEFAULT_PROMO_TIMEZONE,
): boolean {
  if (!activeTimeStart || !activeTimeEnd) return true
  const start = toMinutes(activeTimeStart)
  const end = toMinutes(activeTimeEnd)
  if (start === null || end === null) return true // horario mal cargado: no ocultar la promo
  const current = localDayMinutes(now, timeZone).minutes
  if (start <= end) return current >= start && current <= end
  return current >= start || current <= end
}

/**
 * Evaluación completa de scheduling: fecha + día de semana + horario.
 * Retorna true si la promo debería estar activa ahora en la sede.
 */
export function isPromoScheduledNow(
  promo: {
    scheduledStart?: Date | null
    scheduledEnd?: Date | null
    activeDays?: number[] | null
    activeTimeStart?: string | null
    activeTimeEnd?: string | null
  },
  timeZone: string | null | undefined = DEFAULT_PROMO_TIMEZONE,
  now: Date = new Date(),
): boolean {
  // Rango de fechas (instantes absolutos: no dependen de la zona)
  if (promo.scheduledStart && now < new Date(promo.scheduledStart)) return false
  if (promo.scheduledEnd && now > new Date(promo.scheduledEnd)) return false

  // Día de la semana
  if (!isPromoActiveToday(promo.activeDays, timeZone, now)) return false

  // Ventana horaria
  if (!isPromoInTimeWindow(promo.activeTimeStart, promo.activeTimeEnd, now, timeZone)) return false

  return true
}
