// ============================================================================
// Pantallas — QR de pedido y atribución (22/11/2026)
// ============================================================================
// El QR de cada pantalla lleva al menú de SU sede con ?source=pantalla.<id>.
// El menú ya guarda ese origen (SourceTracker → sessionStorage) y el checkout
// lo manda con el pedido (Order.source): no se tocó ni el checkout ni el POS.
//
// Reporte: pedidos con ese origen agrupados por pantalla (cantidad e importe)
// y, por sede, cruzados con las reproducciones de PlacementDailyStat:
// «pedidos cada 1.000 reproducciones». Solo agregados: sin clientes,
// teléfonos ni pedidos sueltos.
// Límite honesto: se atribuye el pedido hecho en la misma sesión del celular
// que escaneó el QR; si la persona vuelve más tarde por otro camino, no cuenta.
// ============================================================================

import mongoose from 'mongoose'
import Order from '@/models/Order'
import PlacementDailyStat from '@/models/PlacementDailyStat'
import DisplayDevice from '@/models/DisplayDevice'
import Location from '@/models/Location'
import { locationPathSegment } from '@/lib/menu/location-ref'
import { dayInArgentina } from '@/lib/placements/ingest'

export const SCREEN_SOURCE_PREFIX = 'pantalla.'

export function appOrigin(): string {
  return (process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://www.takeasygo.com').replace(/\/+$/, '')
}

export function screenSource(deviceId: string): string {
  return `${SCREEN_SOURCE_PREFIX}${deviceId}`
}

/** Menú de la sede con el origen de la pantalla. */
export function orderUrlFor(tenantSlug: string, location: { slug?: string | null; _id?: unknown }, deviceId: string): string {
  return `${appOrigin()}/${tenantSlug}/menu/${locationPathSegment(location)}?source=${encodeURIComponent(screenSource(deviceId))}`
}

/** Id de pantalla de un origen, o null si no es de pantalla. */
export function deviceIdFromSource(source: unknown): string | null {
  if (typeof source !== 'string' || !source.startsWith(SCREEN_SOURCE_PREFIX)) return null
  const id = source.slice(SCREEN_SOURCE_PREFIX.length)
  return /^[a-f0-9]{24}$/i.test(id) ? id : null
}

export interface AttributionRow {
  deviceId: string
  name: string
  locationId: string | null
  locationName: string | null
  orders: number
  /** Centavos. */
  revenue: number
}
export interface LocationRow {
  locationId: string
  locationName: string
  plays: number
  orders: number
  revenue: number
  /** Pedidos por cada 1.000 reproducciones (null sin reproducciones). */
  ordersPer1000Plays: number | null
}

export async function attributionReport(tenantId: string, opts: { days: number; locationIds: string[] | null; now?: Date }) {
  const now = opts.now ?? new Date()
  const from = new Date(now.getTime() - opts.days * 86_400_000)
  const tid = new mongoose.Types.ObjectId(tenantId)
  const locFilter = opts.locationIds ? { locationId: { $in: opts.locationIds.map((id) => new mongoose.Types.ObjectId(id)) } } : {}

  const [orderRows, playRows] = await Promise.all([
    Order.aggregate<{ _id: string; orders: number; revenue: number }>([
      { $match: { tenantId: tid, ...locFilter, createdAt: { $gte: from }, source: { $regex: `^${SCREEN_SOURCE_PREFIX.replace('.', '\\.')}` }, status: { $nin: ['cancelled', 'awaiting_payment'] } } },
      { $group: { _id: '$source', orders: { $sum: 1 }, revenue: { $sum: '$total' } } },
    ]),
    PlacementDailyStat.aggregate<{ _id: unknown; plays: number }>([
      { $match: { tenantId: tid, placement: 'screen', day: { $gte: dayInArgentina(from) }, ...locFilter } },
      { $group: { _id: '$locationId', plays: { $sum: '$c.plays' } } },
    ]),
  ])

  const byDevice = new Map<string, { orders: number; revenue: number }>()
  for (const r of orderRows) {
    const id = deviceIdFromSource(r._id)
    if (id) byDevice.set(id, { orders: r.orders, revenue: r.revenue })
  }
  const devices = await DisplayDevice.find({ tenantId: tid, ...(opts.locationIds ? locFilter : {}), $or: [{ status: 'active' }, { _id: { $in: [...byDevice.keys()].map((id) => new mongoose.Types.ObjectId(id)) } }] })
    .select('name locationId').lean<Array<{ _id: unknown; name: string; locationId: unknown }>>()
  const locIds = new Set<string>([...devices.map((d) => String(d.locationId)), ...playRows.map((p) => String(p._id))].filter((x) => x && x !== 'null'))
  const locs = await Location.find({ _id: { $in: [...locIds] }, tenantId: tid }).select('name').lean<Array<{ _id: unknown; name: string }>>()
  const locName = new Map(locs.map((l) => [String(l._id), l.name]))

  const rows: AttributionRow[] = devices.map((d) => {
    const a = byDevice.get(String(d._id)) ?? { orders: 0, revenue: 0 }
    const lid = d.locationId ? String(d.locationId) : null
    return { deviceId: String(d._id), name: d.name, locationId: lid, locationName: lid ? locName.get(lid) ?? null : null, orders: a.orders, revenue: a.revenue }
  }).sort((a, b) => b.orders - a.orders)

  const perLoc = new Map<string, LocationRow>()
  for (const id of locIds) perLoc.set(id, { locationId: id, locationName: locName.get(id) ?? 'Sede', plays: 0, orders: 0, revenue: 0, ordersPer1000Plays: null })
  for (const p of playRows) { const r = perLoc.get(String(p._id)); if (r) r.plays += p.plays }
  for (const d of rows) { if (d.locationId && perLoc.has(d.locationId)) { const r = perLoc.get(d.locationId)!; r.orders += d.orders; r.revenue += d.revenue } }
  for (const r of perLoc.values()) r.ordersPer1000Plays = r.plays > 0 ? Math.round((r.orders / r.plays) * 1000 * 10) / 10 : null

  return {
    days: opts.days,
    devices: rows,
    locations: [...perLoc.values()].sort((a, b) => b.orders - a.orders),
    totals: { orders: rows.reduce((n, r) => n + r.orders, 0), revenue: rows.reduce((n, r) => n + r.revenue, 0), plays: [...perLoc.values()].reduce((n, r) => n + r.plays, 0) },
  }
}
