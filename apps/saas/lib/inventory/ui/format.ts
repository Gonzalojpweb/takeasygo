// ============================================================================
// Inventario V3 — formatos en lenguaje del restaurante (puro, sin React)
// ============================================================================
// Regla: una estimación nunca se muestra como cantidad exacta. "≈ 12 kg" y,
// si la incertidumbre importa, "entre 10,5 y 13,5 kg". Nunca "σ".
// ============================================================================

export type InvUnit = 'kg' | 'g' | 'l' | 'ml' | 'unit'

export const UNIT_SHORT: Record<string, string> = { kg: 'kg', g: 'g', l: 'l', ml: 'ml', unit: 'u.' }
export const UNIT_LONG: Record<string, string> = { kg: 'kilos', g: 'gramos', l: 'litros', ml: 'mililitros', unit: 'unidades' }

const nf = (max: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: max })

/** Decimales razonables según la magnitud (12,5 kg · 0,35 kg · 1.250 g). */
function decimalsFor(value: number): number {
  const a = Math.abs(value)
  if (a >= 100) return 0
  if (a >= 10) return 1
  return 2
}

export function formatQty(value: number, unit: string): string {
  return `${nf(decimalsFor(value)).format(value)} ${UNIT_SHORT[unit] ?? unit}`
}

/** Cantidad con signo para movimientos: "+5 kg" / "−0,3 kg". */
export function formatDelta(value: number, unit: string): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${formatQty(Math.abs(value), unit)}`
}

export function pesos(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('es-AR')}`
}

export interface EstimateText {
  /** Texto principal: "≈ 12 kg", "Sin conteo inicial", "Faltante: −0,3 kg". */
  main: string
  /** Rango cuando la incertidumbre es relevante: "entre 10,5 y 13,5 kg". */
  range: string | null
}

/**
 * Estimación legible. El rango (±1,64σ ≈ 90 %) solo aparece si es relevante
 * (más de 5 % de la cantidad): un número casi seguro no necesita rango.
 */
export function estimateText(b: { mu: number; sigma: number; anchored: boolean }, unit: string): EstimateText {
  if (!b.anchored) return { main: 'Sin conteo inicial', range: null }
  if (b.mu < 0) return { main: `Faltante: ${formatDelta(b.mu, unit)}`, range: null }
  const main = `≈ ${formatQty(b.mu, unit)}`
  const half = 1.64 * b.sigma
  if (half <= 0 || half < Math.abs(b.mu) * 0.05) return { main, range: null }
  const lo = Math.max(0, b.mu - half)
  const hi = b.mu + half
  return { main, range: `entre ${nf(decimalsFor(lo)).format(lo)} y ${formatQty(hi, unit)}` }
}

/** Nivel de confianza del servidor → texto comprensible (nunca solo color). */
export const CONFIDENCE_TEXT: Record<string, { label: string; hint: string }> = {
  high: { label: 'Dato confiable', hint: 'Coincide con los últimos conteos y movimientos.' },
  medium: { label: 'Conviene verificar', hint: 'Pasó tiempo o hubo muchos movimientos desde el último conteo.' },
  low: { label: 'Poco confiable', hint: 'Un conteo rápido lo vuelve a poner en orden.' },
  critical: { label: 'Muy incierto', hint: 'El número puede estar lejos de la realidad: contalo.' },
  unknown: { label: 'Sin conteo', hint: 'Todavía no se contó: el sistema no sabe cuánto hay.' },
}

export function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime())
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

/** "hoy", "ayer" o fecha corta, para agrupar la actividad por día. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((start(now) - start(d)) / 86_400_000)
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}
