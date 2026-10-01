/**
 * lib/report-range.ts
 * Helpers puros para los rangos de tiempo del panel de reportes.
 * Se usan en el cliente (presets del filtro) y en el server (deltas de upsell),
 * por lo que todo es testeable sin tocar fechas del sistema fuera de los tests.
 */

/** Presets en días que ofrece el filtro de fechas de /admin/reports. */
export const PRESET_DAYS = [7, 15, 30, 60, 90, 180, 365] as const

export type PresetDays = (typeof PRESET_DAYS)[number]

/** Formatea a `YYYY-MM-DD` en hora local (mismo formato que espera el server). */
export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function today(now: Date = new Date()): string {
  return fmtDate(now)
}

/**
 * Rango "últimos N días": desde hace N días hasta hoy.
 * `now` es inyectable para que los tests no dependan del reloj de la máquina.
 */
export function presetRange(
  days: number,
  now: Date = new Date()
): { from: string; to: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  start.setDate(start.getDate() - days)
  return { from: fmtDate(start), to: fmtDate(now) }
}

/**
 * Variación porcentual entre dos valores.
 * Devuelve `null` cuando no se puede comparar (base 0 o ambos 0) para que la UI
 * muestre "sin datos" en vez de un `%` inventado.
 */
export function deltaPct(current: number, prev: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(prev)) return null
  if (prev === 0) return null
  return Math.round(((current - prev) / prev) * 100)
}

/**
 * Diferencia en puntos para métricas que ya son porcentaje (ej. tasa de conversión).
 * `null` si falta la base previa.
 */
export function deltaPoints(current: number, prev: number | null): number | null {
  if (prev === null || !Number.isFinite(prev)) return null
  if (!Number.isFinite(current)) return null
  return Math.round(current - prev)
}

/**
 * Label legible de un rango `from → to` (`YYYY-MM-DD`).
 * Si el rango termina hoy y coincide con un preset de días, devuelve
 * "últimos N días" en vez de las fechas crudas.
 */
export function buildPeriodLabel(from: string, to: string, now: Date = new Date()): string {
  if (!from || !to) return 'Período'

  if (to === fmtDate(now)) {
    const start = parseLocalDate(from)
    if (start) {
      const days = Math.round((stripTime(now).getTime() - start.getTime()) / DAY_MS)
      if ((PRESET_DAYS as readonly number[]).includes(days)) return `últimos ${days} días`
    }
  }

  return `${from} → ${to}`
}

const DAY_MS = 24 * 60 * 60 * 1000

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function parseLocalDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}
