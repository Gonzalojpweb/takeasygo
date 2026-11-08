// Formatos del tablero del grupo (servidor y cliente).

export const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('es-AR')}`

/** $4,2 M · $850 mil · $12.300 — para gráficos y tarjetas chicas. */
export function moneyShort(cents: number): string {
  const p = cents / 100
  const abs = Math.abs(p)
  if (abs >= 1_000_000) return `$${(p / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`
  if (abs >= 10_000) return `$${Math.round(p / 1000).toLocaleString('es-AR')} mil`
  return `$${Math.round(p).toLocaleString('es-AR')}`
}

/** Variación porcentual; null si no hay base para comparar. */
export function pctChange(cur: number, prev: number): number | null {
  if (!prev) return null
  return Math.round(((cur - prev) / prev) * 1000) / 10
}

export const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export const CHANNEL_LABEL: Record<string, string> = { salon: 'Salón', mostrador: 'Mostrador', app: 'App TakeasyGO', delivery: 'Delivery externo' }
export const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo', mercadopago: 'Mercado Pago', posnet_debit: 'Débito', posnet_credit: 'Crédito',
  transfer: 'Transferencia', kripton: 'Kripton', mixed: 'Mixto', otro: 'Otro',
}

/** Paleta categórica para las marcas (se distingue en claro y oscuro). */
export const BRAND_COLORS = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0891b2', '#db2777', '#ca8a04', '#4f46e5', '#059669', '#dc2626', '#7c3aed', '#0d9488']
