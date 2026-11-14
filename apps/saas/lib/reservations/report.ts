import mongoose from 'mongoose'
import Reservation from '@/models/Reservation'
import { safeDecrypt } from '@/lib/crypto'

// ============================================================================
// Reporte de reservas y clientes (panel, 14/11/2026)
// ============================================================================
// Cómo se mueven las reservas (recibidas o por fecha de la reserva) y quiénes
// reservaron, para que el administrador pueda contactarlos.
//
// Privacidad (Ley 25.326):
//   · nombre y teléfono están cifrados en la base: se descifran acá, en el
//     server, solo para quien ve el panel (admin/encargado de la sede);
//   · `marketingOptIn` = el cliente aceptó novedades/promos al reservar. Sin
//     ese permiso el contacto es solo operativo (su reserva): el panel no
//     ofrece mensajes promocionales ni lo exporta.
// Se agrupa por teléfono normalizado (últimos 10 dígitos); sin teléfono, email.
// ============================================================================

export const REPORT_MAX_ROWS = 20000
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const ID_RE = /^[a-f0-9]{24}$/i
const STATUSES = ['pending_payment', 'confirmed', 'cancelled', 'seated', 'no_show', 'waitlist'] as const
export type ReservationStatus = (typeof STATUSES)[number]

export const STATUS_LABELS: Record<ReservationStatus, string> = {
  pending_payment: 'Esperando seña',
  confirmed: 'Confirmada',
  seated: 'Vino',
  no_show: 'No vino',
  cancelled: 'Cancelada',
  waitlist: 'Lista de espera',
}

export const PRESETS = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 } as const
export type Preset = keyof typeof PRESETS | 'custom'

export interface ReservationReportFilters {
  preset: Preset
  from: string
  to: string
  /** created = recibidas en el período; date = reservas PARA el período. */
  basis: 'created' | 'date'
  locationId: string | null
  status: ReservationStatus | null
  spaceId: string | null
  /** Solo clientes con permiso para promos (pestaña Clientes). */
  optInOnly: boolean
}

/** Hoy en Argentina (UTC−3). */
function arToday(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

function shift(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00-03:00`)
  d.setUTCDate(d.getUTCDate() + days)
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
}

export function parseReportFilters(params: Record<string, string | string[] | undefined>): ReservationReportFilters {
  const get = (k: string) => {
    const v = params[k]
    return (Array.isArray(v) ? v[0] : v ?? '').trim()
  }
  const today = arToday()
  const presetRaw = get('preset')
  let preset: Preset = presetRaw in PRESETS || presetRaw === 'custom' ? (presetRaw as Preset) : '30d'
  let from: string
  let to: string
  if (preset === 'custom' && DAY_RE.test(get('from')) && DAY_RE.test(get('to'))) {
    from = get('from')
    to = get('to')
    if (from > to) [from, to] = [to, from]
    if (shift(from, 731) < to) from = shift(to, -731)
  } else {
    if (preset === 'custom') preset = '30d'
    to = today
    from = shift(today, -(PRESETS[preset as keyof typeof PRESETS] - 1))
  }
  const status = get('status')
  return {
    preset,
    from,
    to,
    basis: get('basis') === 'date' ? 'date' : 'created',
    locationId: ID_RE.test(get('location')) ? get('location') : null,
    status: (STATUSES as readonly string[]).includes(status) ? (status as ReservationStatus) : null,
    spaceId: ID_RE.test(get('space')) ? get('space') : null,
    optInOnly: get('optin') === '1',
  }
}

export function filtersQuery(f: ReservationReportFilters, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ preset: f.preset, basis: f.basis })
  if (f.preset === 'custom') { q.set('from', f.from); q.set('to', f.to) }
  if (f.locationId) q.set('location', f.locationId)
  if (f.status) q.set('status', f.status)
  if (f.spaceId) q.set('space', f.spaceId)
  if (f.optInOnly) q.set('optin', '1')
  for (const [k, v] of Object.entries(extra)) q.set(k, v)
  return q.toString()
}

export function buildReportQuery(tenantId: string, f: ReservationReportFilters, scopeLocationIds: string[] | null): Record<string, unknown> {
  const q: Record<string, unknown> = { tenantId: new mongoose.Types.ObjectId(tenantId) }
  if (f.basis === 'date') q.date = { $gte: f.from, $lte: f.to }
  else q.createdAt = { $gte: new Date(`${f.from}T00:00:00-03:00`), $lt: new Date(`${shift(f.to, 1)}T00:00:00-03:00`) }
  if (scopeLocationIds) {
    const allowed = scopeLocationIds.filter((id) => ID_RE.test(id))
    const wanted = f.locationId ? allowed.filter((id) => id === f.locationId) : allowed
    q.locationId = { $in: wanted.map((id) => new mongoose.Types.ObjectId(id)) }
  } else if (f.locationId) {
    q.locationId = new mongoose.Types.ObjectId(f.locationId)
  }
  if (f.status) q.status = f.status
  if (f.spaceId) q.spaceId = new mongoose.Types.ObjectId(f.spaceId)
  return q
}

interface RawReservation {
  _id: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  date: string
  time: string
  partySize: number
  name: string
  phone: string
  email?: string
  status: ReservationStatus
  spaceId?: mongoose.Types.ObjectId | null
  marketingOptIn?: boolean
  payment?: { amount?: number; status?: string }
  createdAt: Date
}

export interface ReportRow {
  id: string
  locationId: string
  date: string
  time: string
  partySize: number
  name: string
  phone: string
  email: string
  status: ReservationStatus
  spaceId: string | null
  optIn: boolean
  depositCents: number
  createdAt: Date
}

export async function loadReportRows(query: Record<string, unknown>): Promise<{ rows: ReportRow[]; truncated: boolean }> {
  const docs = await Reservation.find(query)
    .sort({ createdAt: -1 })
    .limit(REPORT_MAX_ROWS + 1)
    .select('locationId date time partySize name phone email status spaceId marketingOptIn payment.amount payment.status createdAt')
    .lean<RawReservation[]>()
  const truncated = docs.length > REPORT_MAX_ROWS
  const rows = docs.slice(0, REPORT_MAX_ROWS).map((r) => ({
    id: String(r._id),
    locationId: String(r.locationId),
    date: r.date,
    time: r.time,
    partySize: r.partySize ?? 0,
    name: safeDecrypt(r.name) ?? '',
    phone: safeDecrypt(r.phone) ?? '',
    email: (r.email ?? '').trim(),
    status: r.status,
    spaceId: r.spaceId ? String(r.spaceId) : null,
    optIn: r.marketingOptIn === true,
    depositCents: r.payment?.status === 'approved' ? r.payment.amount ?? 0 : 0,
    createdAt: r.createdAt,
  }))
  return { rows, truncated }
}

// ── Resumen ─────────────────────────────────────────────────────────────────

export interface ReportSummary {
  total: number
  guests: number
  byStatus: Record<ReservationStatus, number>
  /** Vinieron / (vinieron + no vinieron), en %. null sin datos. */
  showRate: number | null
  cancelRate: number | null
  depositCents: number
  avgParty: number | null
  /** Días promedio entre que reservan y la fecha de la reserva. */
  avgLeadDays: number | null
  byDay: { day: string; count: number; guests: number }[]
  byWeekday: { label: string; count: number }[]
  byHour: { label: string; count: number }[]
  bySpace: { spaceId: string | null; count: number; guests: number }[]
  byLocation: { locationId: string; count: number; guests: number }[]
  customers: number
  optInCustomers: number
}

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n * 1000) / d) / 10 : null
}

export function summarize(rows: ReportRow[], f: ReservationReportFilters): ReportSummary {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<ReservationStatus, number>
  const days = new Map<string, { count: number; guests: number }>()
  for (let d = f.from; d <= f.to; d = shift(d, 1)) days.set(d, { count: 0, guests: 0 })
  const weekday = new Array(7).fill(0)
  const hours = new Map<number, number>()
  const spaces = new Map<string, { count: number; guests: number }>()
  const locations = new Map<string, { count: number; guests: number }>()
  let guests = 0
  let deposit = 0
  let leadSum = 0
  let leadN = 0
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
    guests += r.partySize
    deposit += r.depositCents
    const dayKey = f.basis === 'date' ? r.date : new Date(r.createdAt.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
    const d = days.get(dayKey)
    if (d) { d.count++; d.guests += r.partySize }
    const wd = new Date(`${r.date}T12:00:00-03:00`).getUTCDay()
    if (!Number.isNaN(wd)) weekday[wd]++
    const h = Number((r.time ?? '').slice(0, 2))
    if (Number.isInteger(h)) hours.set(h, (hours.get(h) ?? 0) + 1)
    const sk = r.spaceId ?? ''
    const sp = spaces.get(sk) ?? { count: 0, guests: 0 }
    sp.count++; sp.guests += r.partySize; spaces.set(sk, sp)
    const lc = locations.get(r.locationId) ?? { count: 0, guests: 0 }
    lc.count++; lc.guests += r.partySize; locations.set(r.locationId, lc)
    const lead = (new Date(`${r.date}T12:00:00-03:00`).getTime() - r.createdAt.getTime()) / 86_400_000
    if (Number.isFinite(lead) && lead >= -1) { leadSum += Math.max(0, lead); leadN++ }
  }
  const customers = groupCustomers(rows)
  const attended = byStatus.seated + byStatus.no_show
  const hourKeys = Array.from(hours.keys()).sort((a, b) => a - b)
  return {
    total: rows.length,
    guests,
    byStatus,
    showRate: pct(byStatus.seated, attended),
    cancelRate: pct(byStatus.cancelled, rows.length),
    depositCents: deposit,
    avgParty: rows.length ? Math.round((guests / rows.length) * 10) / 10 : null,
    avgLeadDays: leadN ? Math.round((leadSum / leadN) * 10) / 10 : null,
    byDay: Array.from(days.entries()).map(([day, v]) => ({ day, ...v })),
    byWeekday: [1, 2, 3, 4, 5, 6, 0].map((i) => ({ label: WEEKDAYS[i], count: weekday[i] })),
    byHour: hourKeys.map((h) => ({ label: `${String(h).padStart(2, '0')} h`, count: hours.get(h) ?? 0 })),
    bySpace: Array.from(spaces.entries()).map(([k, v]) => ({ spaceId: k || null, ...v })).sort((a, b) => b.count - a.count),
    byLocation: Array.from(locations.entries()).map(([k, v]) => ({ locationId: k, ...v })).sort((a, b) => b.count - a.count),
    customers: customers.length,
    optInCustomers: customers.filter((c) => c.optIn).length,
  }
}

// ── Clientes ────────────────────────────────────────────────────────────────

export interface ReservationCustomer {
  key: string
  name: string
  phone: string
  email: string
  reservations: number
  guests: number
  seated: number
  noShows: number
  cancelled: number
  firstAt: Date
  lastDate: string
  /** Último permiso conocido para promos (la reserva más reciente manda). */
  optIn: boolean
}

/** Clave de cliente: últimos 10 dígitos del teléfono; sin teléfono, email. */
export function customerKey(phone: string, email: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length >= 6) return `t:${digits.slice(-10)}`
  return email ? `e:${email.toLowerCase()}` : ''
}

export function groupCustomers(rows: ReportRow[]): ReservationCustomer[] {
  const map = new Map<string, ReservationCustomer & { lastCreated: number }>()
  for (const r of rows) {
    const key = customerKey(r.phone, r.email)
    if (!key) continue
    const c = map.get(key)
    const created = r.createdAt.getTime()
    if (!c) {
      map.set(key, {
        key, name: r.name, phone: r.phone, email: r.email, reservations: 1, guests: r.partySize,
        seated: r.status === 'seated' ? 1 : 0, noShows: r.status === 'no_show' ? 1 : 0, cancelled: r.status === 'cancelled' ? 1 : 0,
        firstAt: r.createdAt, lastDate: r.date, optIn: r.optIn, lastCreated: created,
      })
      continue
    }
    c.reservations++
    c.guests += r.partySize
    if (r.status === 'seated') c.seated++
    if (r.status === 'no_show') c.noShows++
    if (r.status === 'cancelled') c.cancelled++
    if (r.createdAt < c.firstAt) c.firstAt = r.createdAt
    if (r.date > c.lastDate) c.lastDate = r.date
    if (created > c.lastCreated) {
      // La reserva más reciente manda: nombre, email y permiso vigentes.
      c.lastCreated = created
      c.name = r.name || c.name
      c.email = r.email || c.email
      c.optIn = r.optIn
    }
  }
  return Array.from(map.values())
    .map(({ lastCreated: _l, ...c }) => c)
    .sort((a, b) => b.reservations - a.reservations || b.lastDate.localeCompare(a.lastDate))
}

// ── Mensajes ────────────────────────────────────────────────────────────────

/** Teléfono para wa.me (solo dígitos; agrega 54 si es un número local de 10). */
export function whatsappNumber(phone: string): string | null {
  let d = phone.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 10) d = `54${d}`
  return d.length >= 11 && d.length <= 15 ? d : null
}

export interface ContactTemplate {
  id: 'reservation' | 'invite' | 'menu' | 'club'
  label: string
  /** Promocional: solo con permiso del cliente. */
  promotional: boolean
  text: string
}

export function contactTemplates(input: { tenantName: string; firstName: string; menuUrl: string; reserveUrl: string | null; clubUrl: string }): ContactTemplate[] {
  const hi = input.firstName ? `¡Hola ${input.firstName}!` : '¡Hola!'
  return [
    { id: 'reservation', label: 'Sobre su reserva', promotional: false, text: `${hi} Te escribimos de ${input.tenantName} por tu reserva.` },
    { id: 'invite', label: 'Invitación a volver', promotional: true, text: `${hi} Te extrañamos en ${input.tenantName}. ${input.reserveUrl ? `Reservá tu próxima mesa acá: ${input.reserveUrl}` : '¡Te esperamos!'}` },
    { id: 'menu', label: 'Menú, delivery y take away', promotional: true, text: `${hi} En ${input.tenantName} también tenemos delivery y take away. Mirá el menú y pedí acá: ${input.menuUrl}` },
    { id: 'club', label: 'Promos y club', promotional: true, text: `${hi} Sumate al club de ${input.tenantName} y enterate de las promos: ${input.clubUrl}` },
  ]
}
