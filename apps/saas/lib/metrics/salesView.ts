import mongoose from 'mongoose'
import { deliveryCommissionCents, type DeliveryPlatformConfig } from '@takeasygo/business'
import Order from '@/models/Order'
import Table from '@/models/Table'
import Menu from '@/models/Menu'
import Location from '@/models/Location'
import FiscalDocument from '@/models/FiscalDocument'
import FiscalProfile from '@/models/FiscalProfile'
import { DEFAULT_TIMEZONE, getDayAndMidnightInTimezone } from '@/lib/restaurant-time'
import {
  DELIVERY_PLATFORM_IDS,
  SALE_CHANNELS,
  assertRange,
  computeSalesMetrics,
  isBilledSale,
  type MetricOrder,
  type SaleChannel,
  type SalesMetrics,
  type SalesRange,
} from './sales'
import { SALE_FILTER, channelFilter, escapeRegex, nextDay, toSaleRow, type RawOrder, type SaleRow } from './salesList'
import { emptySalesCost, loadSalesCost, type SalesCost } from './salesCost'

// ============================================================================
// Vista de Ventas del POS — filtros + métricas + listado + costo (2026-10-25)
// ============================================================================
// Pedido 25/10: «terminar el contexto y todo el flujo de ventas: filtros
// dentro del workspace por estado, tipo (salón, mostrador, app, marketplaces
// externos), medio de pago, facturado / no facturado, rangos de tiempo… todo
// lo que corresponde a un local gastronómico, en conjunto con el inventario».
//
// UNA carga por consulta: las ventas del rango que cumplen los filtros
// alimentan a la vez los KPIs, los desgloses, el listado paginado y el costo.
// Así lo que dice el resumen es exactamente lo que muestra la lista.
//
// Filtros:
//   channel   salon | mostrador | app | delivery (marketplaces) | all
//   status    billed (cobradas) | voided (anuladas) | all
//   payment   medio (cash, posnet_debit, posnet_credit, mercadopago, transfer,
//             kripton) — en el POS por cobro, en la App el del pedido
//   invoice   invoiced (factura autorizada sin NC) | not_invoiced (sin
//             factura o anulada por NC) | pending (pedida, sin CAE) | all
//   mode      takeaway | delivery | dine-in | business (pedidos de la App)
//   platform  pedidosya | rappi | uber_eats | didi_food (marketplaces)
//   hourFrom/hourTo  franja horaria en la zona de la sede (admite cruzar la
//             medianoche: 20→2 = turno noche)
//   q         mesa, código o producto
// El estado fiscal sale de FiscalDocument (mismo ambiente que el perfil).
// ============================================================================

export const SALE_STATUSES = ['all', 'billed', 'voided'] as const
export const INVOICE_FILTERS = ['all', 'invoiced', 'not_invoiced', 'pending'] as const
export const ORDER_MODES = ['takeaway', 'delivery', 'dine-in', 'business'] as const
export const PAYMENT_METHODS = ['cash', 'posnet_debit', 'posnet_credit', 'mercadopago', 'transfer', 'kripton'] as const

export interface SalesFilters {
  channel: SaleChannel | 'all'
  status: (typeof SALE_STATUSES)[number]
  payment: string | 'all'
  invoice: (typeof INVOICE_FILTERS)[number]
  mode: (typeof ORDER_MODES)[number] | 'all'
  platform: string | 'all'
  hourFrom: number | null
  hourTo: number | null
  q: string
}

export type FiscalState = 'invoiced' | 'credited' | 'pending' | 'none'

export interface SaleViewRow extends SaleRow {
  fiscal: { state: FiscalState; label: string | null }
  /** Costo de mercadería de la venta (inventario). null = sin dato. @storedAs cents */
  costCents: number | null
}

export interface SalesViewResult {
  range: SalesRange
  filters: SalesFilters
  total: number
  page: number
  pageSize: number
  rows: SaleViewRow[]
  metrics: SalesMetrics
  /** Sobre las ventas cobradas del filtro (las anuladas no se facturan). */
  invoicing: Record<'invoiced' | 'notInvoiced' | 'pending', { count: number; amount: number }>
  /** Desglose de la App por modo y de marketplaces por plataforma. */
  byMode: { mode: string; sales: number; revenue: number }[]
  /**
   * Marketplaces por plataforma. Fase 5: comisión según la config de la
   * sede (null si la plataforma no está configurada) y neto = vendido − comisión.
   */
  byPlatform: {
    platform: string
    sales: number
    revenue: number
    commissionPercent: number | null
    commissionCents: number | null
    netCents: number | null
    settlement: 'platform' | 'local' | null
  }[]
  cost: {
    available: boolean
    cmvCents: number
    grossMarginCents: number
    /** CMV / ingresos de las ventas con costo (0–100). */
    foodCostPct: number | null
    coverage: { mappedPortions: number; totalPortions: number }
    unmappedProducts: { name: string; portions: number }[]
    missingCostSkus: number
  }
  products: { name: string; quantity: number; revenue: number; costCents: number | null; marginPct: number | null }[]
}

const MAX_ORDERS = 10_000
const MAX_PAGE_SIZE = 100

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function hourOf(v: string | null): number | null {
  if (v === null || v === '') return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= 24 ? n : null
}

/** Lee y valida los filtros de la query (nunca lanza: lo inválido = sin filtro). */
export function parseSalesFilters(p: URLSearchParams): SalesFilters {
  const channel = p.get('channel')
  const platform = p.get('platform')
  const payment = p.get('payment')
  const hourFrom = hourOf(p.get('hourFrom'))
  const hourTo = hourOf(p.get('hourTo'))
  return {
    channel: channel && (SALE_CHANNELS as string[]).includes(channel) ? (channel as SaleChannel) : 'all',
    status: pick(p.get('status'), SALE_STATUSES, 'all'),
    payment: payment && (PAYMENT_METHODS as readonly string[]).includes(payment) ? payment : 'all',
    invoice: pick(p.get('invoice'), INVOICE_FILTERS, 'all'),
    mode: pick(p.get('mode'), [...ORDER_MODES, 'all'] as const, 'all'),
    platform: platform && DELIVERY_PLATFORM_IDS.has(platform) ? platform : 'all',
    hourFrom: hourFrom !== null && hourTo !== null && hourFrom !== hourTo ? hourFrom : null,
    hourTo: hourFrom !== null && hourTo !== null && hourFrom !== hourTo ? hourTo : null,
    q: (p.get('q') ?? '').trim().slice(0, 60),
  }
}

/** Estado fiscal de una venta a partir de sus comprobantes (pura). */
export function fiscalStateOf(docs: { kind: string; status: string; label: string | null }[]): { state: FiscalState; label: string | null } {
  const invoice = docs.find((d) => d.kind === 'invoice')
  if (!invoice) return { state: 'none', label: null }
  if (invoice.status !== 'authorized') return { state: 'pending', label: invoice.label }
  if (docs.some((d) => d.kind === 'credit_note' && d.status === 'authorized')) return { state: 'credited', label: invoice.label }
  return { state: 'invoiced', label: invoice.label }
}

export function matchesInvoice(filter: SalesFilters['invoice'], state: FiscalState): boolean {
  if (filter === 'all') return true
  if (filter === 'invoiced') return state === 'invoiced'
  if (filter === 'pending') return state === 'pending'
  return state === 'none' || state === 'credited'
}

function docLabel(d: { kind: string; letter: string; pointOfSale: number; number: number | null }): string {
  const name = d.kind === 'invoice' ? 'Factura' : 'Nota de crédito'
  return d.number !== null
    ? `${name} ${d.letter} ${String(d.pointOfSale).padStart(5, '0')}-${String(d.number).padStart(8, '0')}`
    : `${name} ${d.letter}`
}

const VIEW_FIELDS =
  'posId orderNumber source posTableId channel orderMode guests createdAt status total discountAmount payment.method payment.status posPayments voided itemVoids ' +
  'items.menuItemId items.name items.categoryName items.quantity items.subtotal items.notes items.course items.customizations items.posDiscount'

type ViewOrder = RawOrder & MetricOrder

export async function loadSalesView(
  tenantId: string,
  locationId: string,
  rangeQuery: Partial<SalesRange>,
  filters: SalesFilters,
  paging: { page?: number; pageSize?: number; all?: boolean } = {}
): Promise<SalesViewResult> {
  const location = await Location.findOne({ _id: locationId, tenantId })
    .select('timezone deliveryPlatforms')
    .lean<{ timezone?: string; deliveryPlatforms?: DeliveryPlatformConfig[] }>()
  const platformConfig = new Map((location?.deliveryPlatforms ?? []).map((c) => [c.id as string, c]))
  const timezone = location?.timezone || DEFAULT_TIMEZONE
  const range = assertRange(rangeQuery, timezone)
  const start = getDayAndMidnightInTimezone(range.from, timezone).date
  const end = getDayAndMidnightInTimezone(nextDay(range.to), timezone).date
  const tid = new mongoose.Types.ObjectId(tenantId)
  const lid = new mongoose.Types.ObjectId(locationId)

  const tables = await Table.find({ tenantId, locationId }).select('posId number section').lean<{ posId: string; number: number; section?: string | null }[]>()
  const tableById = new Map(tables.map((t) => [t.posId, t]))

  // ── Filtros que resuelve la base ─────────────────────────────────────────
  const and: Record<string, unknown>[] = [
    { tenantId: tid, locationId: lid, createdAt: { $gte: start, $lt: end }, deletedAt: null },
    SALE_FILTER,
  ]
  if (filters.channel !== 'all') and.push(channelFilter(filters.channel))
  if (filters.status === 'billed') and.push({ voided: null })
  if (filters.status === 'voided') and.push({ voided: { $ne: null }, status: { $ne: 'cancelled' } })
  if (filters.payment !== 'all') {
    and.push({ $or: [{ 'posPayments.method': filters.payment }, { 'posPayments.0': { $exists: false }, 'payment.method': filters.payment }] })
  }
  if (filters.mode !== 'all') and.push({ orderMode: filters.mode })
  if (filters.platform !== 'all') and.push({ channel: filters.platform })
  if (filters.hourFrom !== null && filters.hourTo !== null) {
    const hour = { $hour: { date: '$createdAt', timezone } }
    and.push({
      $expr: filters.hourFrom < filters.hourTo
        ? { $and: [{ $gte: [hour, filters.hourFrom] }, { $lt: [hour, filters.hourTo] }] }
        : { $or: [{ $gte: [hour, filters.hourFrom] }, { $lt: [hour, filters.hourTo] }] },
    })
  }
  if (filters.q) {
    const rx = new RegExp(escapeRegex(filters.q), 'i')
    const byTable = /^\d{1,3}$/.test(filters.q) ? tables.filter((t) => t.number === Number(filters.q)).map((t) => t.posId) : []
    and.push({ $or: [{ orderNumber: rx }, { posId: rx }, { 'items.name': rx }, ...(byTable.length ? [{ posTableId: { $in: byTable } }] : [])] })
  }

  const [docs, menus, profile] = await Promise.all([
    Order.find({ $and: and }).sort({ createdAt: -1 }).limit(MAX_ORDERS).select(VIEW_FIELDS).lean<ViewOrder[]>(),
    Menu.find({ tenantId, locationId })
      .select('categories.name categories.items._id categories.subcategories.items._id')
      .lean<{ categories?: { name?: string; items?: { _id: unknown }[]; subcategories?: { items?: { _id: unknown }[] }[] }[] }[]>(),
    FiscalProfile.findOne({ tenantId }).select('environment').lean<{ environment?: string }>(),
  ])

  // ── Estado fiscal de cada venta ──────────────────────────────────────────
  const fiscalDocs = docs.length
    ? await FiscalDocument.find({ tenantId: tid, environment: profile?.environment ?? 'homologation', orderId: { $in: docs.map((d) => d._id) } })
        .select('orderId kind status letter pointOfSale number')
        .lean<{ orderId: unknown; kind: string; status: string; letter: string; pointOfSale: number; number: number | null }[]>()
    : []
  const docsByOrder = new Map<string, { kind: string; status: string; label: string | null }[]>()
  for (const d of fiscalDocs) {
    const key = String(d.orderId)
    docsByOrder.set(key, [...(docsByOrder.get(key) ?? []), { kind: d.kind, status: d.status, label: docLabel(d) }])
  }
  const fiscalOf = (o: ViewOrder) => fiscalStateOf(docsByOrder.get(String(o._id)) ?? [])

  // ── Filtro de facturación (sobre el estado fiscal) ───────────────────────
  const filtered = filters.invoice === 'all' ? docs : docs.filter((o) => matchesInvoice(filters.invoice, fiscalOf(o).state))

  // ── Métricas sobre exactamente lo filtrado ───────────────────────────────
  const categoryByItem = new Map<string, string>()
  for (const menu of menus) {
    for (const cat of menu.categories ?? []) {
      for (const it of [...(cat.items ?? []), ...(cat.subcategories ?? []).flatMap((s) => s.items ?? [])]) {
        categoryByItem.set(String(it._id), cat.name ?? 'Sin categoría')
      }
    }
  }
  const metrics = computeSalesMetrics(filtered, { timezone, categoryByItem })
  const billed = filtered.filter((o) => !o.voided && isBilledSale(o))

  const invoicing = { invoiced: { count: 0, amount: 0 }, notInvoiced: { count: 0, amount: 0 }, pending: { count: 0, amount: 0 } }
  const modes = new Map<string, { sales: number; revenue: number }>()
  const platforms = new Map<string, { sales: number; revenue: number }>()
  for (const o of billed) {
    const st = fiscalOf(o).state
    const bucket = st === 'invoiced' ? invoicing.invoiced : st === 'pending' ? invoicing.pending : invoicing.notInvoiced
    bucket.count++
    bucket.amount += o.total
    if (o.channel && DELIVERY_PLATFORM_IDS.has(o.channel)) {
      const p = platforms.get(o.channel) ?? { sales: 0, revenue: 0 }
      p.sales++; p.revenue += o.total
      platforms.set(o.channel, p)
    } else if (o.source !== 'pos' && o.orderMode) {
      const m = modes.get(o.orderMode) ?? { sales: 0, revenue: 0 }
      m.sales++; m.revenue += o.total
      modes.set(o.orderMode, m)
    }
  }

  // ── Inventario: costo de lo vendido ──────────────────────────────────────
  let costData: SalesCost = emptySalesCost()
  try {
    costData = await loadSalesCost(tenantId, locationId, billed.map((o) => String(o._id)))
  } catch (err) {
    console.error('[sales-view] costo de ventas no disponible:', err)
  }
  const revenueWithCost = billed.filter((o) => costData.byOrder.has(String(o._id))).reduce((s, o) => s + o.total, 0)
  // Todos los platos del filtro (no solo el top): cantidad, ingreso, costo y margen.
  const productAgg = new Map<string, { name: string; quantity: number; revenue: number }>()
  for (const o of billed) {
    for (const it of o.items ?? []) {
      const cur = productAgg.get(it.name) ?? { name: it.name, quantity: 0, revenue: 0 }
      cur.quantity += it.quantity
      cur.revenue += it.subtotal // mismo criterio que categorías y productos del resumen
      productAgg.set(it.name, cur)
    }
  }
  const products = [...productAgg.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 200).map((p) => {
    const c = costData.byProduct.get(p.name)
    const costCents = c && c.portions > 0 ? Math.round((c.costCents / c.portions) * p.quantity) : null
    return { ...p, costCents, marginPct: costCents !== null && p.revenue > 0 ? Math.round(((p.revenue - costCents) / p.revenue) * 1000) / 10 : null }
  })

  // ── Listado paginado ─────────────────────────────────────────────────────
  const pageSize = paging.all ? filtered.length || 1 : Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(paging.pageSize ?? 20)))
  const page = paging.all ? 0 : Math.max(0, Math.floor(paging.page ?? 0))
  const slice = filtered.slice(page * pageSize, page * pageSize + pageSize)
  const rows: SaleViewRow[] = slice.map((o) => ({
    ...toSaleRow(o, tableById),
    fiscal: fiscalOf(o),
    costCents: costData.byOrder.has(String(o._id)) ? costData.byOrder.get(String(o._id))! : null,
  }))

  return {
    range,
    filters,
    total: filtered.length,
    page,
    pageSize,
    rows,
    metrics,
    invoicing,
    byMode: [...modes.entries()].map(([mode, v]) => ({ mode, ...v })).sort((a, b) => b.revenue - a.revenue),
    byPlatform: [...platforms.entries()]
      .map(([platform, v]) => {
        const c = platformConfig.get(platform)
        const commissionCents = c ? deliveryCommissionCents(v.revenue, c.commissionPercent) : null
        return {
          platform,
          ...v,
          commissionPercent: c?.commissionPercent ?? null,
          commissionCents,
          netCents: commissionCents === null ? null : v.revenue - commissionCents,
          settlement: c?.settlement ?? null,
        }
      })
      .sort((a, b) => b.revenue - a.revenue),
    cost: {
      available: costData.available,
      cmvCents: costData.cmvCents,
      grossMarginCents: revenueWithCost - costData.cmvCents,
      foodCostPct: costData.available && revenueWithCost > 0 ? Math.round((costData.cmvCents / revenueWithCost) * 1000) / 10 : null,
      coverage: costData.coverage,
      unmappedProducts: costData.unmappedProducts,
      missingCostSkus: costData.missingCostSkus,
    },
    products,
  }
}

/** Oculta dinero y costo (cajero: ve cantidades, no ingresos). */
export function redactSalesView(v: SalesViewResult): unknown {
  const nul = <T extends object>(o: T, keys: (keyof T)[]) => ({ ...o, ...Object.fromEntries(keys.map((k) => [k, null])) })
  return {
    ...v,
    rows: v.rows.map((r) => ({
      ...r,
      total: null,
      discounts: null,
      costCents: null,
      items: r.items.map((i) => ({ ...i, total: null, discount: i.discount ? { ...i.discount, amount: null } : null })),
      payments: r.payments.map((x) => ({ ...x, amount: null })),
    })),
    metrics: {
      ...v.metrics,
      totals: nul(v.metrics.totals, ['revenue', 'perGuest', 'discounts']),
      byChannel: Object.fromEntries(Object.entries(v.metrics.byChannel).map(([k, c]) => [k, { ...c, revenue: null }])),
      byPayment: v.metrics.byPayment.map((p) => ({ ...p, amount: null })),
      byCategory: v.metrics.byCategory.map((c) => ({ ...c, revenue: null })),
      byHour: v.metrics.byHour.map((h) => ({ ...h, revenue: null })),
      topProducts: v.metrics.topProducts.map((p) => ({ ...p, revenue: null })),
    },
    invoicing: Object.fromEntries(Object.entries(v.invoicing).map(([k, b]) => [k, { ...b, amount: null }])),
    byMode: v.byMode.map((m) => ({ ...m, revenue: null })),
    byPlatform: v.byPlatform.map((m) => ({ ...m, revenue: null, commissionCents: null, netCents: null })),
    cost: { available: v.cost.available, coverage: v.cost.coverage, unmappedProducts: v.cost.unmappedProducts, cmvCents: null, grossMarginCents: null, foodCostPct: null, missingCostSkus: v.cost.missingCostSkus },
    products: v.products.map((p) => ({ ...p, revenue: null, costCents: null, marginPct: null })),
  }
}

const CHANNEL_TEXT: Record<string, string> = { salon: 'Salón', mostrador: 'Mostrador', app: 'App TakeasyGO', delivery: 'Marketplaces' }
const STATUS_TEXT: Record<string, string> = { billed: 'Cobradas', voided: 'Anuladas' }
const INVOICE_TEXT: Record<string, string> = { invoiced: 'Facturadas', not_invoiced: 'Sin facturar', pending: 'Factura pendiente' }
const PAYMENT_TEXT: Record<string, string> = { cash: 'Efectivo', posnet_debit: 'Débito', posnet_credit: 'Crédito', mercadopago: 'MercadoPago', transfer: 'Transferencia', kripton: 'Kripton' }
const MODE_TEXT: Record<string, string> = { takeaway: 'Retiro', delivery: 'Envío', 'dine-in': 'En el local', business: 'Empresas' }
const PLATFORM_TEXT: Record<string, string> = { pedidosya: 'PedidosYa', rappi: 'Rappi', uber_eats: 'Uber Eats', didi_food: 'DiDi Food' }

/** Texto de los filtros activos (cabecera del PDF / Excel). */
export function describeSalesFilters(f: SalesFilters): string {
  const parts: string[] = []
  if (f.channel !== 'all') parts.push(CHANNEL_TEXT[f.channel] ?? f.channel)
  if (f.platform !== 'all') parts.push(PLATFORM_TEXT[f.platform] ?? f.platform)
  if (f.mode !== 'all') parts.push(MODE_TEXT[f.mode] ?? f.mode)
  if (f.status !== 'all') parts.push(STATUS_TEXT[f.status])
  if (f.payment !== 'all') parts.push(PAYMENT_TEXT[f.payment] ?? f.payment)
  if (f.invoice !== 'all') parts.push(INVOICE_TEXT[f.invoice])
  if (f.hourFrom !== null && f.hourTo !== null) parts.push(`${String(f.hourFrom).padStart(2, '0')}:00 a ${String(f.hourTo).padStart(2, '0')}:00`)
  if (f.q) parts.push(`«${f.q}»`)
  return parts.join(' · ')
}
