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

/** Desfase (minutos) de la zona respecto de UTC en ese instante. AR = −180. */
function zoneOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(at)
  const n = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'))
  return Math.round((asUtc - at.getTime()) / 60000)
}

/** Medianoche local (en UTC) del día calendario y/m/d en la zona. */
function zonedMidnight(y: number, m: number, d: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(y, m, d))
  return new Date(guess.getTime() - zoneOffsetMinutes(guess, timeZone) * 60000)
}

/**
 * Ventana real de las fechas «desde/hasta» de una promo.
 * El panel carga fechas sin hora («2026-11-08») y se guardaban como medianoche
 * UTC: «hasta el 08/11» vencía el 7 a las 21 h de Argentina. Una fecha sin hora
 * (exactamente 00:00:00.000 UTC) vale todo ese día calendario en la sede:
 * desde → 00:00 local; hasta → 23:59:59.999 local. Con hora, se respeta tal cual.
 */
export function effectiveScheduleWindow(
  scheduledStart: Date | string | null | undefined,
  scheduledEnd: Date | string | null | undefined,
  timeZone: string | null | undefined = DEFAULT_PROMO_TIMEZONE,
): { start: Date | null; end: Date | null } {
  let tz = timeZone || DEFAULT_PROMO_TIMEZONE
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }) } catch { tz = DEFAULT_PROMO_TIMEZONE }
  const dateOnly = (d: Date) => d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0
  const toDate = (v: Date | string | null | undefined) => (v ? new Date(v) : null)
  const s = toDate(scheduledStart)
  const e = toDate(scheduledEnd)
  const start = s && !Number.isNaN(s.getTime())
    ? (dateOnly(s) ? zonedMidnight(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), tz) : s)
    : null
  const end = e && !Number.isNaN(e.getTime())
    ? (dateOnly(e) ? new Date(zonedMidnight(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate() + 1, tz).getTime() - 1) : e)
    : null
  return { start, end }
}

/** ¿Ahora está dentro de las fechas «desde/hasta» de la promo (en la sede)? */
export function isPromoWithinDates(
  promo: { scheduledStart?: Date | string | null; scheduledEnd?: Date | string | null },
  timeZone: string | null | undefined = DEFAULT_PROMO_TIMEZONE,
  now: Date = new Date(),
): boolean {
  const { start, end } = effectiveScheduleWindow(promo.scheduledStart, promo.scheduledEnd, timeZone)
  if (start && now < start) return false
  if (end && now > end) return false
  return true
}

/**
 * Margen para el filtro grueso de la base (fechas sin hora pueden extenderse
 * hasta ~1 día + desfase). El filtro exacto lo hace isPromoWithinDates.
 */
export const SCHEDULE_QUERY_SLACK_MS = 2 * 24 * 60 * 60_000

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
  // Rango de fechas: una fecha sin hora vale todo ese día en la sede.
  if (!isPromoWithinDates(promo, timeZone, now)) return false

  // Día de la semana
  if (!isPromoActiveToday(promo.activeDays, timeZone, now)) return false

  // Ventana horaria
  if (!isPromoInTimeWindow(promo.activeTimeStart, promo.activeTimeEnd, now, timeZone)) return false

  return true
}
