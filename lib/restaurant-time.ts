const DAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

function getWeekdayAndMinutes(date: Date, timezone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(date)
  return {
    day: DAY_MAP[parts.find(p => p.type === 'weekday')!.value] ?? date.getDay(),
    minutes:
      parseInt(parts.find(p => p.type === 'hour')!.value) * 60 +
      parseInt(parts.find(p => p.type === 'minute')!.value),
  }
}

export function getNowInTimezone(timezone?: string): { day: number; minutes: number } {
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Argentina/Buenos_Aires'
  return getWeekdayAndMinutes(new Date(), tz)
}

export function getLocalDayAndMinutes(date: Date, timezone?: string): { day: number; minutes: number } {
  const tz = timezone || 'America/Argentina/Buenos_Aires'
  return getWeekdayAndMinutes(date, tz)
}

/**
 * Dado un string "YYYY-MM-DD" que representa una fecha calendario en el
 * timezone del restaurante, retorna el día de la semana (0=Dom) en ese timezone
 * y un Date que representa la medianoche de esa fecha en el timezone local.
 */
export function getDayAndMidnightInTimezone(dateStr: string, timezone?: string): { date: Date; day: number } {
  const tz = timezone || 'America/Argentina/Buenos_Aires'
  const [y, M, d] = dateStr.split('-').map(Number)

  const noonRef = new Date(Date.UTC(y, M - 1, d, 12, 0, 0))

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(noonRef)
  const localMinutes =
    parseInt(parts.find(p => p.type === 'hour')!.value) * 60 +
    parseInt(parts.find(p => p.type === 'minute')!.value)

  const midnightLocal = new Date(Date.UTC(y, M - 1, d, 0, 0, 0, 0) + (720 - localMinutes) * 60 * 1000)

  const wkParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  }).formatToParts(midnightLocal)
  const day = DAY_MAP[wkParts.find(p => p.type === 'weekday')!.value] ?? 0

  return { date: midnightLocal, day }
}
