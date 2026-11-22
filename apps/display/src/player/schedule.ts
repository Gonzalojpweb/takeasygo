// ============================================================================
// Qué se puede mostrar ahora (puro, sin DOM: se testea en node)
// ============================================================================
// Una pieza se muestra si:
//  · empezó y no venció (startsAt/endsAt) según la hora CORREGIDA (serverTime);
//  · está dentro de su franja horaria (días y horas en la zona de la sede);
//  · su archivo está guardado en el equipo (sin internet se usa lo guardado);
//  · no está «en penitencia» por errores seguidos.
// ============================================================================

import { isActiveAt } from '../shared/clock'

export interface Daypart {
  /** 0 = domingo … 6 = sábado. Vacío o ausente = todos los días. */
  days?: number[]
  /** «HH:MM». Si from > to la franja cruza la medianoche (p. ej. 20:00–02:00). */
  from?: string | null
  to?: string | null
}

export interface ManifestItem {
  id: string
  kind: 'image' | 'video'
  url1080: string
  url720: string
  posterUrl: string | null
  durationMs: number
  startsAt: string | null
  endsAt: string | null
  updatedAt: string
  bytes: number | null
  daypart?: Daypart | null
}

export interface Manifest {
  version: string
  serverTime: string
  pollAfterS: number
  timezone?: string | null
  device: { name: string; orientation: 'landscape' | 'portrait' }
  items: ManifestItem[]
}

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Día de la semana y minutos desde la medianoche en una zona horaria. */
export function localParts(nowMs: number, timeZone: string | null | undefined): { day: number; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timeZone || 'America/Argentina/Buenos_Aires', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(nowMs))
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
    const hour = Number(get('hour')) % 24
    return { day: day < 0 ? new Date(nowMs).getDay() : day, minutes: hour * 60 + Number(get('minute')) }
  } catch {
    const d = new Date(nowMs)
    return { day: d.getDay(), minutes: d.getHours() * 60 + d.getMinutes() }
  }
}

const toMin = (hm: string) => { const m = HM.exec(hm)!; return Number(m[1]) * 60 + Number(m[2]) }

/** ¿Está dentro de la franja? Sin franja (o franja inválida) → siempre. */
export function inDaypart(dp: Daypart | null | undefined, nowMs: number, timeZone?: string | null): boolean {
  if (!dp) return true
  const { day, minutes } = localParts(nowMs, timeZone)
  const days = Array.isArray(dp.days) && dp.days.length ? dp.days : null
  const hasHours = !!dp.from && !!dp.to && HM.test(dp.from) && HM.test(dp.to)
  if (!hasHours) return days ? days.includes(day) : true
  const from = toMin(dp.from!)
  const to = toMin(dp.to!)
  if (from === to) return days ? days.includes(day) : true
  if (from < to) return (days ? days.includes(day) : true) && minutes >= from && minutes < to
  // Cruza la medianoche: la parte de después de las 00:00 pertenece al día anterior.
  if (minutes >= from) return days ? days.includes(day) : true
  if (minutes < to) return days ? days.includes((day + 6) % 7) : true
  return false
}

export interface PlayableContext {
  nowMs: number
  timeZone?: string | null
  isCached: (item: ManifestItem) => boolean
  /** Hasta cuándo se saltea una pieza que dio errores seguidos (ms). */
  penaltyUntil: Map<string, number>
}

export function playableItems(items: ManifestItem[], ctx: PlayableContext): ManifestItem[] {
  return items.filter((i) =>
    isActiveAt(i, ctx.nowMs)
    && inDaypart(i.daypart, ctx.nowMs, ctx.timeZone)
    && ctx.isCached(i)
    && (ctx.penaltyUntil.get(i.id) ?? 0) <= ctx.nowMs,
  )
}

/**
 * Calidad del video según la pantalla, en píxeles REALES (CSS × escala):
 * lado largo < 1920 → 720p; si no, 1080p. Tolerancia de 1 % por el redondeo de
 * la escala (1279 × 1,5 = 1918,5 es una pantalla de 1920).
 * Si el navegador dice que 1080p NO se decodifica fluido (mediaCapabilities),
 * 720p. No se usa navigator.deviceMemory: el navegador lo limita por
 * privacidad (tope 8 GB, redondeado) y no sirve para decidir.
 */
export const FULL_HD_LONG_SIDE = 1920
export function chooseQuality(screenW: number, screenH: number, dpr: number, smooth1080: boolean | null = null): '720' | '1080' {
  const longSide = Math.max(screenW, screenH) * (dpr || 1)
  if (smooth1080 === false) return '720'
  return longSide < FULL_HD_LONG_SIDE * 0.99 ? '720' : '1080'
}

/** ¿El equipo decodifica 1080p H.264 fluido? null si el navegador no lo informa. */
export async function canDecode1080Smooth(): Promise<boolean | null> {
  const mc = (navigator as Navigator & { mediaCapabilities?: MediaCapabilities }).mediaCapabilities
  if (!mc?.decodingInfo) return null
  try {
    const r = await mc.decodingInfo({ type: 'file', video: { contentType: 'video/mp4; codecs="avc1.640028"', width: 1920, height: 1080, bitrate: 4_000_000, framerate: 30 } })
    return r.supported ? r.smooth : false
  } catch { return null }
}

export const urlFor = (i: ManifestItem, q: '720' | '1080') => (q === '720' ? i.url720 : i.url1080)
