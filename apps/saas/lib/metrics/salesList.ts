import mongoose from 'mongoose'
import Order from '@/models/Order'
import Table from '@/models/Table'
import Location from '@/models/Location'
import { DEFAULT_TIMEZONE, getDayAndMidnightInTimezone } from '@/lib/restaurant-time'
import { DELIVERY_PLATFORM_IDS, assertRange, saleChannelOf, type SaleChannel, type SalesRange } from './sales'

// ============================================================================
// Listado de ventas paginado desde el servidor (Fase I, 2026-10)
// ============================================================================
// Reemplaza la lectura de la caché del dispositivo en el contexto Ventas del
// POS: cualquier rango, completo y igual en todos los equipos. Misma regla de
// «venta» que lib/metrics/sales (POS cobradas; online facturadas) e incluye
// las anuladas marcadas como tales (se ven, no suman).
// Cada fila trae lo necesario para el detalle (canal, mesa y sector, modo,
// plataforma, comensales, platos, pagos, descuentos, anulación) sin exponer
// datos personales del cliente.
// ============================================================================

export interface SaleRow {
  id: string
  /** posId (solo ventas del POS): para anular desde el POS. */
  posId: string | null
  orderNumber: string | null
  createdAt: Date
  channel: SaleChannel
  table: { number: number; section: string | null } | null
  orderMode: string | null
  platform: string | null
  guests: number | null
  items: {
    name: string
    quantity: number
    total: number
    modifiers: string[]
    notes: string | null
    course: string | null
    discount: { kind: string; value: number; amount: number } | null
  }[]
  payments: { method: string; amount: number; reference: string | null }[]
  paymentMethod: string | null
  discounts: number
  total: number
  voided: { at: Date; reason: string } | null
  chargedInPos: boolean
}

export interface SalesListQuery extends Partial<SalesRange> {
  channel?: SaleChannel | 'all'
  q?: string
  page?: number
  pageSize?: number
}

const MAX_PAGE_SIZE = 100

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Filtro Mongo de «venta» (cobrada/facturada o anulada) — espejo de isBilledSale. */
const SALE_FILTER = {
  $or: [
    { source: 'pos', 'posPayments.0': { $exists: true }, status: { $ne: 'cancelled' } },
    {
      source: { $ne: 'pos' },
      status: { $nin: ['cancelled', 'awaiting_payment'] },
      'payment.status': { $nin: ['rejected', 'cancelled'] },
    },
  ],
}

function channelFilter(channel: SaleChannel): Record<string, unknown> {
  const platforms = [...DELIVERY_PLATFORM_IDS]
  switch (channel) {
    case 'salon': return { source: 'pos', posTableId: { $nin: [null, ''] } }
    case 'mostrador': return { source: 'pos', posTableId: { $in: [null, ''] } }
    case 'delivery': return { channel: { $in: platforms } }
    default: return { source: { $ne: 'pos' }, channel: { $nin: platforms } }
  }
}

type RawOrder = {
  _id: mongoose.Types.ObjectId
  posId?: string | null
  orderNumber?: string | null
  source?: string | null
  posTableId?: string | null
  channel?: string | null
  orderMode?: string | null
  guests?: number | null
  createdAt: Date
  total: number
  discountAmount?: number | null
  payment?: { method?: string | null } | null
  posPayments?: { method: string; amount: number; reference?: string | null }[] | null
  voided?: { at: Date; reason: string } | null
  items?: {
    name: string
    quantity: number
    subtotal: number
    notes?: string | null
    course?: string | null
    customizations?: { selectedOptions?: { name: string }[] }[]
    posDiscount?: { kind: string; value: number; amountCents: number } | null
  }[]
}

export async function listSales(
  tenantId: string,
  locationId: string,
  query: SalesListQuery
): Promise<{ range: SalesRange; total: number; page: number; pageSize: number; rows: SaleRow[] }> {
  const location = await Location.findOne({ _id: locationId, tenantId }).select('timezone').lean<{ timezone?: string }>()
  const timezone = location?.timezone || DEFAULT_TIMEZONE
  const range = assertRange(query, timezone)
  const start = getDayAndMidnightInTimezone(range.from, timezone).date
  const end = getDayAndMidnightInTimezone(nextDay(range.to), timezone).date
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(query.pageSize ?? 20)))
  const page = Math.max(0, Math.floor(query.page ?? 0))

  const tables = await Table.find({ tenantId, locationId }).select('posId number section').lean<{ posId: string; number: number; section?: string | null }[]>()
  const tableById = new Map(tables.map((t) => [t.posId, t]))

  const and: Record<string, unknown>[] = [
    {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      locationId: new mongoose.Types.ObjectId(locationId),
      createdAt: { $gte: start, $lt: end },
      deletedAt: null,
    },
    SALE_FILTER,
  ]
  if (query.channel && query.channel !== 'all') and.push(channelFilter(query.channel))
  const q = query.q?.trim().slice(0, 60)
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i')
    const byTable = /^\d{1,3}$/.test(q) ? tables.filter((t) => t.number === Number(q)).map((t) => t.posId) : []
    and.push({ $or: [{ orderNumber: rx }, { posId: rx }, { 'items.name': rx }, ...(byTable.length ? [{ posTableId: { $in: byTable } }] : [])] })
  }
  const filter = { $and: and }

  const [total, docs] = await Promise.all([
    Order.countDocuments(filter),
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(page * pageSize)
      .limit(pageSize)
      .select('posId orderNumber source posTableId channel orderMode guests createdAt total discountAmount payment.method posPayments voided items.name items.quantity items.subtotal items.notes items.course items.customizations items.posDiscount')
      .lean<RawOrder[]>(),
  ])

  const rows: SaleRow[] = docs.map((o) => {
    const table = o.posTableId ? tableById.get(o.posTableId) : undefined
    const items = (o.items ?? []).map((i) => ({
      name: i.name,
      quantity: i.quantity,
      total: i.subtotal,
      modifiers: (i.customizations ?? []).flatMap((c) => (c.selectedOptions ?? []).map((s) => s.name)),
      notes: i.notes ?? null,
      course: i.course ?? null,
      discount: i.posDiscount && i.posDiscount.amountCents > 0
        ? { kind: i.posDiscount.kind, value: i.posDiscount.value, amount: i.posDiscount.amountCents }
        : null,
    }))
    return {
      id: String(o._id),
      posId: o.posId ?? null,
      orderNumber: o.orderNumber ?? null,
      createdAt: o.createdAt,
      channel: saleChannelOf(o),
      table: table ? { number: table.number, section: table.section ?? null } : null,
      orderMode: o.orderMode ?? null,
      platform: o.channel && DELIVERY_PLATFORM_IDS.has(o.channel) ? o.channel : null,
      guests: o.guests ?? null,
      items,
      payments: (o.posPayments ?? []).map((p) => ({ method: p.method, amount: p.amount, reference: p.reference ?? null })),
      paymentMethod: o.payment?.method ?? null,
      discounts: (o.discountAmount ?? 0) + items.reduce((s, i) => s + (i.discount?.amount ?? 0), 0),
      total: o.total,
      voided: o.voided ? { at: o.voided.at, reason: o.voided.reason } : null,
      chargedInPos: o.source === 'pos' && Boolean(o.posPayments?.length),
    }
  })

  return { range, total, page, pageSize, rows }
}
