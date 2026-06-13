const DAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

/**
 * Returns the UTC offset (in minutes) for a given IANA timezone at the current
 * instant. Positive values are east of UTC (e.g. UTC+3 → +180).
 */
function getOffsetMinutes(timezone: string): number {
  const now = new Date()
  const str = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  }).format(now)
  const m = str.match(/GMT([+-]\d{2}):(\d{2})/)
  if (m) {
    const sign = m[1][0] === '+' ? 1 : -1
    return sign * (parseInt(m[2]) * 60 + parseInt(m[3]))
  }
  return 0
}

/**
 * Converts a UTC Date to local calendar values in the given timezone.
 */
function toLocal(date: Date, timezone: string): { y: number; M: number; d: number; h: number; m: number; s: number; wd: number } {
  const offset = getOffsetMinutes(timezone)
  const local = new Date(date.getTime() + offset * 60 * 1000)
  return {
    y: local.getUTCFullYear(),
    M: local.getUTCMonth() + 1,
    d: local.getUTCDate(),
    h: local.getUTCHours(),
    m: local.getUTCMinutes(),
    s: local.getUTCSeconds(),
    wd: local.getUTCDay(),
  }
}

export function getNowInTimezone(timezone?: string): { day: number; minutes: number } {
  const tz = timezone || 'America/Argentina/Buenos_Aires'
  const local = toLocal(new Date(), tz)
  return { day: local.wd, minutes: local.h * 60 + local.m }
}

export function getLocalDayAndMinutes(date: Date, timezone?: string): { day: number; minutes: number } {
  const tz = timezone || 'America/Argentina/Buenos_Aires'
  const local = toLocal(date, tz)
  return { day: local.wd, minutes: local.h * 60 + local.m }
}

/**
 * Dado "YYYY-MM-DD" que representa una fecha calendario en el timezone del
 * restaurante, retorna el día de la semana (0=Dom) en ese timezone y un Date
 * UTC que representa la medianoche de esa fecha.
 */
export function getDayAndMidnightInTimezone(dateStr: string, timezone?: string): { date: Date; day: number } {
  const tz = timezone || 'America/Argentina/Buenos_Aires'
  const [y, M, d] = dateStr.split('-').map(Number)

  // Get offset by looking at noon UTC on the requested date
  const noonRef = new Date(Date.UTC(y, M - 1, d, 12, 0, 0))
  const offset = getOffsetMinutes(tz)

  // Midnight local in the target timezone expressed as UTC
  const midnightLocal = new Date(Date.UTC(y, M - 1, d, 0, 0, 0, 0) - offset * 60 * 1000)

  // Day of week at midnight local
  const local = toLocal(midnightLocal, tz)

  return { date: midnightLocal, day: local.wd }
}
