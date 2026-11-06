import mongoose from 'mongoose'
import Order from '@/models/Order'
import Combo from '@/models/Combo'
import Location from '@/models/Location'
import CustomerEvent from '@/models/CustomerEvent'
import { DEFAULT_TIMEZONE, getDayAndMidnightInTimezone } from '@/lib/restaurant-time'
import { assertRange, isBilledSale, saleChannelOf, type SaleChannel, type SalesRange } from '@/lib/metrics/sales'

// ============================================================================
// Rendimiento de los combos (piloto 06/11/2026)
// ============================================================================
// Embudo por combo y por sede, en un rango de días:
//   vistas (se mostró en el carrusel) → aperturas (lo tocaron) → agregados
//   al carrito → compras (pedidos cobrados).
// Vistas, aperturas y agregados salen de CustomerEvent (menú online, sin
// datos personales: solo comboId + sesión anónima). Las compras salen de los
// pedidos cobrados (online y POS, misma regla que las métricas de ventas).
// El POS no genera vistas: sus ventas cuentan como compras directas.
// ============================================================================

export type ComboEventType = 'combo_impression' | 'combo_opened' | 'combo_add'
export const COMBO_EVENT_TYPES: readonly ComboEventType[] = ['combo_impression', 'combo_opened', 'combo_add']

export interface ComboReportRow {
  comboId: string
  name: string
  isActive: boolean
  priceMode: string
  fixedPrice: number | null
  /** Embudo del menú online. */
  impressions: number
  uniqueViewers: number
  opens: number
  addsToCart: number
  /** Ventas cobradas (todos los canales). */
  orders: number
  units: number
  revenue: number
  avgTicket: number
  byChannel: Record<SaleChannel, { units: number; revenue: number }>
  /** Tasas del embudo online (0–1, null sin datos para calcular). */
  openRate: number | null
  addRate: number | null
  /** Compras online / agregados al carrito. */
  checkoutRate: number | null
  /** Compras online / vistas únicas. */
  conversionRate: number | null
  topComponents: { name: string; quantity: number }[]
  byDay: { date: string; units: number; revenue: number }[]
}

export interface ComboReport {
  range: SalesRange
  timezone: string
  totals: { impressions: number; opens: number; addsToCart: number; units: number; revenue: number; orders: number }
  combos: ComboReportRow[]
}

interface OrderLike {
  _id: unknown
  source?: string
  posTableId?: string | null
  channel?: string | null
  status: string
  payment?: { status?: string }
  posPayments?: unknown[] | null
  createdAt: Date
  items: { itemType?: string; comboId?: string | null; comboComponent?: boolean; name: string; quantity: number; subtotal: number }[]
}

interface EventAgg { comboId: string; type: ComboEventType; count: number; sessions: number }
interface ComboLike { _id: unknown; name: string; isActive?: boolean; priceMode?: string; fixedPrice?: number | null }

const ratio = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 1000) / 1000 : null)

function dayIn(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** Cálculo puro (probado aparte): combos + eventos agregados + pedidos. */
export function computeComboReport(args: {
  combos: ComboLike[]
  events: EventAgg[]
  orders: OrderLike[]
  timezone: string
}): Omit<ComboReport, 'range' | 'timezone'> {
  const rows = new Map<string, ComboReportRow & { _orders: Set<string>; _onlineUnits: number; _components: Map<string, number>; _days: Map<string, { units: number; revenue: number }> }>()
  const row = (id: string, name: string) => {
    let r = rows.get(id)
    if (!r) {
      r = {
        comboId: id, name, isActive: false, priceMode: 'fixed', fixedPrice: null,
        impressions: 0, uniqueViewers: 0, opens: 0, addsToCart: 0,
        orders: 0, units: 0, revenue: 0, avgTicket: 0,
        byChannel: { salon: { units: 0, revenue: 0 }, mostrador: { units: 0, revenue: 0 }, app: { units: 0, revenue: 0 }, delivery: { units: 0, revenue: 0 } },
        openRate: null, addRate: null, checkoutRate: null, conversionRate: null,
        topComponents: [], byDay: [],
        _orders: new Set(), _onlineUnits: 0, _components: new Map(), _days: new Map(),
      }
      rows.set(id, r)
    }
    return r
  }

  for (const c of args.combos) {
    const r = row(String(c._id), c.name)
    r.name = c.name
    r.isActive = c.isActive !== false
    r.priceMode = c.priceMode ?? 'fixed'
    r.fixedPrice = c.fixedPrice ?? null
  }

  for (const e of args.events) {
    const r = rows.get(e.comboId)
    if (!r) continue // combo de otra sede o borrado: no se reporta
    if (e.type === 'combo_impression') { r.impressions += e.count; r.uniqueViewers += e.sessions }
    else if (e.type === 'combo_opened') r.opens += e.count
    else if (e.type === 'combo_add') r.addsToCart += e.count
  }

  for (const order of args.orders) {
    if (!isBilledSale(order as never)) continue
    const channel = saleChannelOf(order as never)
    const day = dayIn(new Date(order.createdAt), args.timezone)
    for (const item of order.items ?? []) {
      if (!item.comboId) continue
      const r = rows.get(String(item.comboId))
      if (!r) continue
      if (item.comboComponent) {
        r._components.set(item.name, (r._components.get(item.name) ?? 0) + item.quantity)
        continue
      }
      if (item.itemType !== 'combo') continue
      r._orders.add(String(order._id))
      r.units += item.quantity
      r.revenue += item.subtotal
      r.byChannel[channel].units += item.quantity
      r.byChannel[channel].revenue += item.subtotal
      if (channel === 'app' || channel === 'delivery') r._onlineUnits += item.quantity
      const d = r._days.get(day) ?? { units: 0, revenue: 0 }
      d.units += item.quantity
      d.revenue += item.subtotal
      r._days.set(day, d)
    }
  }

  const combos: ComboReportRow[] = [...rows.values()].map((r) => {
    const { _orders, _onlineUnits, _components, _days, ...rest } = r
    return {
      ...rest,
      orders: _orders.size,
      avgTicket: r.units > 0 ? Math.round(r.revenue / r.units) : 0,
      openRate: ratio(r.opens, r.impressions),
      addRate: ratio(r.addsToCart, r.opens),
      checkoutRate: ratio(_onlineUnits, r.addsToCart),
      conversionRate: ratio(_onlineUnits, r.uniqueViewers),
      topComponents: [..._components.entries()].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, 8),
      byDay: [..._days.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
    }
  }).sort((a, b) => b.revenue - a.revenue || b.impressions - a.impressions)

  const totals = combos.reduce(
    (t, c) => ({ impressions: t.impressions + c.impressions, opens: t.opens + c.opens, addsToCart: t.addsToCart + c.addsToCart, units: t.units + c.units, revenue: t.revenue + c.revenue, orders: t.orders + c.orders }),
    { impressions: 0, opens: 0, addsToCart: 0, units: 0, revenue: 0, orders: 0 }
  )
  return { totals, combos }
}

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Carga desde la base: acotado SIEMPRE por tenant + sede. */
export async function loadComboReport(tenantId: string, locationId: string, range: Partial<SalesRange>): Promise<ComboReport> {
  const tid = new mongoose.Types.ObjectId(tenantId)
  const lid = new mongoose.Types.ObjectId(locationId)
  const location = await Location.findOne({ _id: lid, tenantId: tid }).select('timezone').lean<{ timezone?: string }>()
  const timezone = location?.timezone || DEFAULT_TIMEZONE
  const r = assertRange(range, timezone)
  const start = getDayAndMidnightInTimezone(r.from, timezone).date
  const end = getDayAndMidnightInTimezone(nextDay(r.to), timezone).date

  const combos = await Combo.find({ tenantId: tid, locationId: lid }).select('name isActive priceMode fixedPrice').lean<ComboLike[]>()
  const comboIds = combos.map((c) => c._id as mongoose.Types.ObjectId)

  const [events, orders] = await Promise.all([
    comboIds.length === 0 ? [] : CustomerEvent.aggregate<EventAgg>([
      {
        $match: {
          tenantId: tid,
          type: { $in: COMBO_EVENT_TYPES },
          createdAt: { $gte: start, $lt: end },
          'data.comboId': { $in: comboIds },
        },
      },
      { $group: { _id: { comboId: '$data.comboId', type: '$type' }, count: { $sum: 1 }, sessions: { $addToSet: '$metadata.sessionId' } } },
      { $project: { _id: 0, comboId: { $toString: '$_id.comboId' }, type: '$_id.type', count: 1, sessions: { $size: '$sessions' } } },
    ]),
    comboIds.length === 0 ? [] : Order.find({
      tenantId: tid,
      locationId: lid,
      createdAt: { $gte: start, $lt: end },
      deletedAt: null,
      'items.comboId': { $in: comboIds.map(String) },
    })
      .select('source posTableId channel status payment.status posPayments createdAt items.itemType items.comboId items.comboComponent items.name items.quantity items.subtotal')
      .lean<OrderLike[]>(),
  ])

  return { range: r, timezone, ...computeComboReport({ combos, events, orders, timezone }) }
}
