const DAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

/**
 * Converts a UTC Date to local calendar values in the given timezone
 * using Intl.DateTimeFormat.formatToParts (no offset string parsing).
 */
function toLocal(date: Date, timezone: string): { y: number; M: number; d: number; h: number; m: number; s: number; wd: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  }).formatToParts(date)

  const get = (type: string): number => {
    const p = parts.find(p => p.type === type)
    return p ? parseInt(p.value, 10) : 0
  }

  const wdStr = parts.find(p => p.type === 'weekday')?.value ?? 'Sun'

  return {
    y: get('year'),
    M: get('month'),
    d: get('day'),
    h: get('hour'),
    m: get('minute'),
    s: get('second'),
    wd: DAY_MAP[wdStr] ?? 0,
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
 *
 * Usa toLocal al mediodía UTC para determinar el offset del timezone y así
 * calcular la medianoche local sin parsear strings de offset.
 */
export function getDayAndMidnightInTimezone(dateStr: string, timezone?: string): { date: Date; day: number } {
  const tz = timezone || 'America/Argentina/Buenos_Aires'
  const [y, M, d] = dateStr.split('-').map(Number)

  // Obtener la hora local al mediodía UTC
  const noonUtc = Date.UTC(y, M - 1, d, 12, 0, 0, 0)
  const localAtNoon = toLocal(new Date(noonUtc), tz)

  // Diferencia en minutos entre la hora local y UTC al mediodía
  const localMinutes = localAtNoon.h * 60 + localAtNoon.m
  const utcMinutes = 12 * 60
  const diffMinutes = localMinutes - utcMinutes

  // Medianoche local en UTC = medianoche UTC - diffMinutes
  const midnightLocalMs = Date.UTC(y, M - 1, d, 0, 0, 0, 0) - diffMinutes * 60 * 1000
  const midnightLocal = new Date(midnightLocalMs)

  // Día de la semana a la medianoche local
  const localMidnight = toLocal(midnightLocal, tz)

  return { date: midnightLocal, day: localMidnight.wd }
}
