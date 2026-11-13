/**
 * lib/organizations/location-compare.ts — tabla «Comparar sedes» de la vista
 * 360 (F4). Puro: recibe el ranking de sedes ya calculado y arma filas de
 * métricas con las sedes como columnas, marcando la mejor y la peor sede de
 * cada fila. El formato (pesos, %) lo pone la pantalla.
 */
import type { LocationRank } from './dashboard'

export type CompareKind = 'money' | 'count' | 'pct'

export interface CompareMetricRow {
  id: string
  label: string
  hint?: string
  kind: CompareKind
  /** Qué es mejor: más alto, más bajo, o ninguno (mezcla de canales). */
  better: 'high' | 'low' | null
  /** Un valor por sede, en el orden de las columnas (null = no aplica). */
  values: (number | null)[]
  /** Variación contra el período anterior, por sede (solo algunas filas). */
  prev?: (number | null)[]
  /** Índices de la mejor y la peor sede (null si no hay con qué comparar). */
  best: number | null
  worst: number | null
}

const round1 = (n: number) => Math.round(n * 10) / 10
const pctOf = (part: number, whole: number) => (whole > 0 ? round1((part / whole) * 100) : null)

/** Mejor y peor entre los valores presentes; necesita 2 distintos. */
export function extremes(values: (number | null)[], better: 'high' | 'low' | null): { best: number | null; worst: number | null } {
  if (!better) return { best: null, worst: null }
  const present = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v !== null)
  if (present.length < 2) return { best: null, worst: null }
  const sorted = [...present].sort((a, b) => a.v - b.v)
  if (sorted[0].v === sorted[sorted.length - 1].v) return { best: null, worst: null }
  const low = sorted[0].i
  const high = sorted[sorted.length - 1].i
  return better === 'high' ? { best: high, worst: low } : { best: low, worst: high }
}

function metric(id: string, label: string, kind: CompareKind, better: 'high' | 'low' | null, values: (number | null)[], extra: Partial<CompareMetricRow> = {}): CompareMetricRow {
  return { id, label, kind, better, values, ...extremes(values, better), ...extra }
}

/**
 * Filas de la comparación. Solo sedes con movimiento en el período (o en el
 * anterior); los canales sin ventas en ninguna sede no aparecen.
 */
export function buildLocationComparison(locations: LocationRank[]): { columns: LocationRank[]; rows: CompareMetricRow[] } {
  const columns = locations.filter(l => l.revenue > 0 || l.prevRevenue > 0)
  if (columns.length < 2) return { columns, rows: [] }

  const rows: CompareMetricRow[] = [
    metric('revenue', 'Facturación', 'money', 'high', columns.map(l => l.revenue), { prev: columns.map(l => l.prevRevenue) }),
    metric('sales', 'Ventas', 'count', 'high', columns.map(l => l.sales), { prev: columns.map(l => l.prevSales) }),
    metric('avgTicket', 'Ticket promedio', 'money', 'high', columns.map(l => (l.sales ? l.avgTicket : null)), { prev: columns.map(l => l.prevAvgTicket) }),
    metric('perGuest', 'Por comensal (salón)', 'money', 'high', columns.map(l => (l.guests > 0 ? l.perGuest : null)), { hint: 'Solo sedes que cargan comensales' }),
    metric('margin', 'Margen teórico', 'pct', 'high', columns.map(l => l.margin?.marginPct ?? null), { hint: 'Según recetas e insumos cargados' }),
    metric('discounts', 'Descuentos', 'pct', 'low', columns.map(l => pctOf(l.discounts, l.revenue + l.discounts)), { hint: 'Sobre lo vendido antes del descuento' }),
    metric('voided', 'Ventas anuladas', 'pct', 'low', columns.map(l => pctOf(l.voided.amount, l.revenue + l.voided.amount)), { hint: 'Sobre lo vendido' }),
    metric('itemVoids', 'Platos anulados', 'pct', 'low', columns.map(l => pctOf(l.itemVoids.amount, l.revenue + l.itemVoids.amount)), { hint: 'Después de mandarlos a cocina' }),
  ]

  const channelLabels: Record<string, string> = { salon: 'Salón', mostrador: 'Mostrador', app: 'App TakeasyGO', delivery: 'Delivery externo' }
  for (const c of Object.keys(channelLabels)) {
    const values = columns.map(l => l.byChannel[c as keyof typeof l.byChannel] ?? 0)
    if (values.every(v => v === 0)) continue
    rows.push(metric(`channel-${c}`, `${channelLabels[c]} (del total)`, 'pct', null, columns.map((l, i) => pctOf(values[i], l.revenue))))
  }

  return { columns, rows }
}
