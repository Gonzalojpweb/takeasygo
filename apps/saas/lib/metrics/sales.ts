import mongoose from 'mongoose'
import Order from '@/models/Order'
import Menu from '@/models/Menu'
import Location from '@/models/Location'
import { DEFAULT_TIMEZONE, getDayAndMidnightInTimezone, getTodayStrInTimezone } from '@/lib/restaurant-time'

// ============================================================================
// Métricas de ventas — fuente única (Fase G, 2026-10)
// ============================================================================
// Pedido 24/10: «el POS debe calcular todas las ventas, siempre separado y
// ordenado por canal, sin generar confusiones». Antes el POS sumaba su caché
// local (200 órdenes: semana y mes incompletos) y el SaaS sumaba todo junto.
// Esta función es LA regla para los dos lados.
//
// CANAL (derivado de cada venta, sin migrar datos viejos):
//   · salon      — venta del POS con mesa
//   · mostrador  — venta del POS sin mesa
//   · app        — pedido online de la App TakeasyGO (SaaS)
//   · delivery   — app de delivery integrada (channel = plataforma)
// Un comercio puede tener solo POS, solo SaaS o los dos: cada canal aparece
// con lo que tenga (los vacíos dan 0) y los totales nunca mezclan sin
// mostrar el desglose.
//
// QUÉ ES UNA VENTA (facturado):
//   · POS: cobrada (tiene posPayments), no anulada, no cancelada.
//   · Online: misma regla que Reportes — sin canceladas, sin awaiting_payment
//     y sin pagos rechazados/cancelados.
//   Las anuladas se informan aparte (cantidad y monto), no suman ingresos.
//
// COMENSALES (KPI obligatorio del POS): Order.guests, que la ruta copia de la
// mesa a su primera ronda. Ticket por comensal = ingresos de Salón ÷
// comensales de Salón (Mostrador y App no tienen comensales).
// ============================================================================

export type SaleChannel = 'salon' | 'mostrador' | 'app' | 'delivery'
export const SALE_CHANNELS: SaleChannel[] = ['salon', 'mostrador', 'app', 'delivery']
export const DELIVERY_PLATFORM_IDS = new Set(['pedidosya', 'rappi', 'uber_eats', 'didi_food'])

export interface MetricOrder {
  _id?: unknown
  source?: string | null
  posTableId?: string | null
  channel?: string | null
  status: string
  total: number
  discountAmount?: number | null
  guests?: number | null
  createdAt: Date
  payment?: { method?: string | null; status?: string | null } | null
  posPayments?: { method: string; amount: number }[] | null
  voided?: { at: Date } | null
  items?: {
    menuItemId?: unknown
    name: string
    categoryName?: string | null
    quantity: number
    subtotal: number
    posDiscount?: { amountCents?: number } | null
  }[]
  itemVoids?: { quantity: number; unitPrice: number; wasted: boolean }[] | null
}

export interface ChannelMetrics {
  sales: number
  revenue: number
  avgTicket: number
  guests: number
}

export interface SalesMetrics {
  totals: ChannelMetrics & {
    perGuest: number
    discounts: number
    voided: { count: number; amount: number }
    itemVoids: { count: number; amount: number; wasteAmount: number }
  }
  byChannel: Record<SaleChannel, ChannelMetrics>
  byPayment: { method: string; amount: number; count: number }[]
  byCategory: { category: string; quantity: number; revenue: number }[]
  byHour: { hour: number; sales: number; revenue: number }[]
  topProducts: { name: string; quantity: number; revenue: number }[]
}

export function saleChannelOf(order: Pick<MetricOrder, 'source' | 'posTableId' | 'channel'>): SaleChannel {
  if (order.channel && DELIVERY_PLATFORM_IDS.has(order.channel)) return 'delivery'
  if (order.source === 'pos') return order.posTableId ? 'salon' : 'mostrador'
  return 'app'
}

/** ¿Cuenta como venta facturada? (anuladas: aparte). */
export function isBilledSale(order: MetricOrder): boolean {
  if (order.status === 'cancelled') return false
  if (order.source === 'pos') return Boolean(order.posPayments?.length)
  if (order.status === 'awaiting_payment') return false
  return !['rejected', 'cancelled'].includes(order.payment?.status ?? '')
}

function emptyChannel(): ChannelMetrics {
  return { sales: 0, revenue: 0, avgTicket: 0, guests: 0 }
}

function hourIn(date: Date, timezone: string): number {
  const h = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', hour12: false, timeZone: timezone }).format(date)
  return Number(h) % 24
}

/** Cálculo puro sobre órdenes ya filtradas por sede y fecha. */
export function computeSalesMetrics(
  orders: MetricOrder[],
  opts: { timezone?: string; categoryByItem?: Map<string, string> } = {}
): SalesMetrics {
  const tz = opts.timezone || DEFAULT_TIMEZONE
  const byChannel = Object.fromEntries(SALE_CHANNELS.map((c) => [c, emptyChannel()])) as Record<SaleChannel, ChannelMetrics>
  const payments = new Map<string, { amount: number; count: number }>()
  const categories = new Map<string, { quantity: number; revenue: number }>()
  const products = new Map<string, { quantity: number; revenue: number }>()
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, sales: 0, revenue: 0 }))
  let discounts = 0
  const voided = { count: 0, amount: 0 }
  const itemVoids = { count: 0, amount: 0, wasteAmount: 0 }

  for (const order of orders) {
    for (const v of order.itemVoids ?? []) {
      itemVoids.count += v.quantity
      itemVoids.amount += v.quantity * v.unitPrice
      if (v.wasted) itemVoids.wasteAmount += v.quantity * v.unitPrice
    }
    if (order.voided) {
      if (order.status !== 'cancelled') { voided.count++; voided.amount += order.total }
      continue
    }
    if (!isBilledSale(order)) continue

    const channel = saleChannelOf(order)
    const c = byChannel[channel]
    c.sales++
    c.revenue += order.total
    if (channel === 'salon' && order.guests) c.guests += order.guests

    const methods = order.posPayments?.length
      ? order.posPayments
      : [{ method: order.payment?.method ?? 'otro', amount: order.total }]
    for (const p of methods) {
      const cur = payments.get(p.method) ?? { amount: 0, count: 0 }
      cur.amount += p.amount
      cur.count++
      payments.set(p.method, cur)
    }

    discounts += order.discountAmount ?? 0
    for (const item of order.items ?? []) {
      discounts += item.posDiscount?.amountCents ?? 0
      const category =
        item.categoryName ||
        (item.menuItemId ? opts.categoryByItem?.get(String(item.menuItemId)) : undefined) ||
        'Sin categoría'
      const cat = categories.get(category) ?? { quantity: 0, revenue: 0 }
      cat.quantity += item.quantity
      cat.revenue += item.subtotal
      categories.set(category, cat)
      const prod = products.get(item.name) ?? { quantity: 0, revenue: 0 }
      prod.quantity += item.quantity
      prod.revenue += item.subtotal
      products.set(item.name, prod)
    }

    const h = hours[hourIn(new Date(order.createdAt), tz)]
    h.sales++
    h.revenue += order.total
  }

  for (const c of Object.values(byChannel)) c.avgTicket = c.sales ? Math.round(c.revenue / c.sales) : 0
  const sales = SALE_CHANNELS.reduce((s, k) => s + byChannel[k].sales, 0)
  const revenue = SALE_CHANNELS.reduce((s, k) => s + byChannel[k].revenue, 0)
  const guests = byChannel.salon.guests

  return {
    totals: {
      sales,
      revenue,
      avgTicket: sales ? Math.round(revenue / sales) : 0,
      guests,
      perGuest: guests ? Math.round(byChannel.salon.revenue / guests) : 0,
      discounts,
      voided,
      itemVoids,
    },
    byChannel,
    byPayment: [...payments.entries()].map(([method, v]) => ({ method, ...v })).sort((a, b) => b.amount - a.amount),
    byCategory: [...categories.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.revenue - a.revenue),
    byHour: hours,
    topProducts: [...products.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
  }
}

export interface SalesRange {
  /** YYYY-MM-DD inclusive, en la zona de la sede. */
  from: string
  to: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function assertRange(range: Partial<SalesRange>, timezone: string): SalesRange {
  const today = getTodayStrInTimezone(timezone)
  const from = range.from && DATE_RE.test(range.from) ? range.from : today
  const to = range.to && DATE_RE.test(range.to) ? range.to : from
  if (to < from) throw new Error('El rango de fechas es inválido')
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000
  if (days > 366) throw new Error('El rango máximo es de un año')
  return { from, to }
}

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const METRIC_FIELDS =
  'source posTableId channel status total discountAmount guests createdAt payment.method payment.status posPayments voided ' +
  'items.menuItemId items.name items.categoryName items.quantity items.subtotal items.posDiscount.amountCents itemVoids'

/**
 * Carga y calcula las métricas de una sede para un rango de días (zona de la
 * sede). Acotado SIEMPRE por tenant + sede.
 */
export async function loadSalesMetrics(
  tenantId: string,
  locationId: string,
  range: Partial<SalesRange>
): Promise<{ range: SalesRange; timezone: string; metrics: SalesMetrics }> {
  const location = await Location.findOne({ _id: locationId, tenantId }).select('timezone').lean<{ timezone?: string }>()
  const timezone = location?.timezone || DEFAULT_TIMEZONE
  const r = assertRange(range, timezone)
  const start = getDayAndMidnightInTimezone(r.from, timezone).date
  const end = getDayAndMidnightInTimezone(nextDay(r.to), timezone).date

  const [orders, menus] = await Promise.all([
    Order.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      locationId: new mongoose.Types.ObjectId(locationId),
      createdAt: { $gte: start, $lt: end },
      deletedAt: null,
    })
      .select(METRIC_FIELDS)
      .lean<MetricOrder[]>(),
    Menu.find({ tenantId, locationId })
      .select('categories.name categories.items._id categories.subcategories.items._id')
      .lean<{ categories?: { name?: string; items?: { _id: unknown }[]; subcategories?: { items?: { _id: unknown }[] }[] }[] }[]>(),
  ])

  // Categoría vigente por plato: completa las ventas viejas del POS que se
  // guardaron sin categoría.
  const categoryByItem = new Map<string, string>()
  for (const menu of menus) {
    for (const cat of menu.categories ?? []) {
      for (const it of [...(cat.items ?? []), ...(cat.subcategories ?? []).flatMap((s) => s.items ?? [])]) {
        categoryByItem.set(String(it._id), cat.name ?? 'Sin categoría')
      }
    }
  }

  return { range: r, timezone, metrics: computeSalesMetrics(orders, { timezone, categoryByItem }) }
}
