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

// ── Horas: 12 h o 24 h (20/11/2026) ─────────────────────────────────────────
// El dueño puede escribir «18:30», «18.30», «18hs», «6:30 pm», «6 p. m.» o
// «12 am». Se guarda siempre «HH:MM» (24 h). Fin EXCLUSIVO: «de 18 a 23» vale
// hasta las 22:59; «23:59» = hasta el final del día.

/** Minuto del día (0–1439) de una hora escrita en 12 h o 24 h. null = no se entiende. */
export function parseTimeOfDay(input: string | null | undefined): number | null {
  if (input == null) return null
  const raw = String(input).trim().toLowerCase().replace(/\s+/g, ' ')
  if (!raw) return null
  const m = /^(\d{1,2})(?:[:.h](\d{2}))?\s*(?:hs?|horas?)?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?$/.exec(raw)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] != null ? Number(m[2]) : 0
  const ampm = m[3]?.replace(/[\s.]/g, '')
  if (min > 59) return null
  if (ampm) {
    if (h < 1 || h > 12) return null
    if (ampm === 'am') h = h === 12 ? 0 : h
    else h = h === 12 ? 12 : h + 12
  } else if (h > 23) {
    // «24:00» = fin del día
    if (h === 24 && min === 0) return 1439
    return null
  }
  return h * 60 + min
}

const pad = (v: number) => String(v).padStart(2, '0')

/** «HH:MM» (24 h) o null si está vacío / no se entiende. */
export function normalizeTimeOfDay(input: string | null | undefined): string | null {
  const minutes = parseTimeOfDay(input)
  return minutes == null ? null : `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

/** «18:30» → «6:30 p. m.» */
export function formatTime12(hhmm: string | null | undefined): string {
  const minutes = parseTimeOfDay(hhmm)
  if (minutes == null) return ''
  const h = Math.floor(minutes / 60)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${pad(minutes % 60)} ${h < 12 ? 'a. m.' : 'p. m.'}`
}

/**
 * Ventana horaria efectiva en minutos [start, end). Sin horas = todo el día.
 * Solo inicio = desde esa hora hasta el final del día; solo fin = desde las
 * 00:00 hasta esa hora. end < start = cruza la medianoche. null = algo mal
 * cargado (no se oculta la promo por eso).
 */
export function promoTimeWindow(
  activeTimeStart: string | null | undefined,
  activeTimeEnd: string | null | undefined,
): { start: number; end: number; allDay: boolean; crossesMidnight: boolean } | null {
  const hasStart = !!activeTimeStart?.trim()
  const hasEnd = !!activeTimeEnd?.trim()
  if (!hasStart && !hasEnd) return { start: 0, end: 1440, allDay: true, crossesMidnight: false }
  const start = hasStart ? parseTimeOfDay(activeTimeStart) : 0
  let end = hasEnd ? parseTimeOfDay(activeTimeEnd) : 1440
  if (start == null || end == null) return null
  if (end === 1439) end = 1440 // 23:59 = hasta el final del día
  if (start === end) return { start: 0, end: 1440, allDay: true, crossesMidnight: false }
  return { start, end, allDay: start === 0 && end === 1440, crossesMidnight: end < start }
}

/**
 * ¿La promo está dentro de la ventana horaria activa (hora de la sede)?
 * Sin horarios → todo el día. Una sola hora → desde / hasta esa hora.
 * Si el fin es menor que el inicio, la ventana cruza la medianoche.
 */
export function isPromoInTimeWindow(
  activeTimeStart: string | null | undefined,
  activeTimeEnd: string | null | undefined,
  now: Date = new Date(),
  timeZone: string | null | undefined = DEFAULT_PROMO_TIMEZONE,
): boolean {
  const w = promoTimeWindow(activeTimeStart, activeTimeEnd)
  if (!w || w.allDay) return true
  const current = localDayMinutes(now, timeZone).minutes
  if (!w.crossesMidnight) return current >= w.start && current < w.end
  return current >= w.start || current < w.end
}

/**
 * Evaluación completa de scheduling: fecha + día de semana + horario.
 * Retorna true si la promo debería estar activa ahora en la sede.
 *
 * Días + ventana que cruza la medianoche: la madrugada pertenece al día en
 * que empezó la ventana. «Lun a Mié de 20:00 a 02:00» vale el jueves a la
 * 01:00 (noche del miércoles) y NO el lunes a la 01:00 (noche del domingo).
 */
export function isPromoScheduledNow(
  promo: {
    scheduledStart?: Date | string | null
    scheduledEnd?: Date | string | null
    activeDays?: number[] | null
    activeTimeStart?: string | null
    activeTimeEnd?: string | null
  },
  timeZone: string | null | undefined = DEFAULT_PROMO_TIMEZONE,
  now: Date = new Date(),
): boolean {
  // Rango de fechas: una fecha sin hora vale todo ese día en la sede.
  if (!isPromoWithinDates(promo, timeZone, now)) return false

  // Ventana horaria
  if (!isPromoInTimeWindow(promo.activeTimeStart, promo.activeTimeEnd, now, timeZone)) return false

  // Día de la semana (la madrugada de una ventana nocturna cuenta para el día anterior)
  const { day, minutes } = localDayMinutes(now, timeZone)
  const w = promoTimeWindow(promo.activeTimeStart, promo.activeTimeEnd)
  const windowDay = w && w.crossesMidnight && minutes < w.end ? (day + 6) % 7 : day
  return isPromoActiveOnDay(promo.activeDays, windowDay)
}

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const

/** «lunes a miércoles» / «lunes, miércoles y viernes» / «todos los días». */
export function describePromoDays(activeDays: number[] | null | undefined): string {
  const days = [...new Set((activeDays ?? []).filter((d) => d >= 0 && d <= 6))].sort()
  if (days.length === 0 || days.length === 7) return 'todos los días'
  // Rango consecutivo (de lunes a domingo, el domingo al final)
  const order = [1, 2, 3, 4, 5, 6, 0]
  const idx = days.map((d) => order.indexOf(d)).sort((a, b) => a - b)
  const consecutive = idx.length >= 3 && idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
  if (consecutive) return `${DAY_NAMES[order[idx[0]]]} a ${DAY_NAMES[order[idx[idx.length - 1]]]}`
  const names = idx.map((i) => DAY_NAMES[order[i]])
  return names.length === 1 ? `solo los ${names[0]}` : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

/** «de 18:00 a 23:00» / «desde las 18:00» / «todo el día». */
export function describePromoHours(activeTimeStart: string | null | undefined, activeTimeEnd: string | null | undefined): string {
  const w = promoTimeWindow(activeTimeStart, activeTimeEnd)
  if (!w || w.allDay) return 'todo el día'
  const fmt = (m: number) => (m >= 1440 ? '24:00' : `${pad(Math.floor(m / 60))}:${pad(m % 60)}`)
  if (w.start === 0) return `hasta las ${fmt(w.end)}`
  if (w.end === 1440) return `desde las ${fmt(w.start)}`
  return `de ${fmt(w.start)} a ${fmt(w.end)}${w.crossesMidnight ? ' (del día siguiente)' : ''}`
}

/**
 * Valida y normaliza lo que manda el panel al guardar una promo (20/11/2026).
 * Horas en 12 h o 24 h → «HH:MM»; vacías → null (todo el día). Días 0–6 sin
 * repetir ([] = todos). Devuelve un mensaje de error o null si está bien.
 * Modifica `data` en el lugar (solo las claves presentes).
 */
export function sanitizePromoScheduleInput(data: Record<string, unknown>): string | null {
  for (const [key, label] of [['activeTimeStart', 'inicio'], ['activeTimeEnd', 'fin']] as const) {
    if (!(key in data)) continue
    const raw = data[key]
    if (raw == null || String(raw).trim() === '') {
      data[key] = null
      continue
    }
    const normalized = normalizeTimeOfDay(String(raw))
    if (!normalized) return `Hora de ${label} inválida: escribila como 18:30 o 6:30 pm`
    data[key] = normalized
  }
  if ('activeDays' in data) {
    const days = Array.isArray(data.activeDays) ? data.activeDays : []
    if (days.some((d) => !Number.isInteger(d) || (d as number) < 0 || (d as number) > 6)) return 'Días de la semana inválidos'
    data.activeDays = [...new Set(days as number[])].sort((a, b) => a - b)
  }
  const start = data.scheduledStart ? new Date(String(data.scheduledStart)) : null
  const end = data.scheduledEnd ? new Date(String(data.scheduledEnd)) : null
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end < start) {
    return 'La fecha de fin es anterior a la de inicio'
  }
  return null
}
