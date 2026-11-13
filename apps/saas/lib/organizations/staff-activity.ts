/**
 * lib/organizations/staff-activity.ts — actividad del personal en las sedes
 * del grupo (F6). Solo lectura.
 *
 * Por persona, en el período y en las sedes que la membresía cubre:
 *   · cobros en el POS (Order.posPayments.userId), sin ventas anuladas;
 *   · ventas anuladas que pidió (voided.by) y que aprobó (voided.approvedBy);
 *   · platos anulados después de mandarlos a cocina (itemVoids.by);
 *   · cajas abiertas y cerradas, con la diferencia del arqueo al cerrar;
 *   · gastos, retiros e ingresos de caja (CashMovement, sin los cobros).
 *
 * Alcance igual que la vista 360 (DASHBOARD_ROLES; los filtros solo achican).
 * Sin datos de clientes. De cada persona solo se muestra nombre y rol.
 *
 * Las fechas son días de la zona de cada sede. Para no barrer toda la
 * colección, los pedidos se buscan por createdAt con un margen de 7 días
 * antes del período (un cobro o una anulación cae casi siempre el mismo día).
 */
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import Order from '@/models/Order'
import CashRegister from '@/models/CashRegister'
import CashMovement from '@/models/CashMovement'
import User from '@/models/User'
import { DEFAULT_TIMEZONE, getDayAndMidnightInTimezone, getTodayStrInTimezone } from '@/lib/restaurant-time'
import { getMyOrganizations } from './me'
import { DASHBOARD_ROLES, compareRange, periodRange, resolveCoverage, type DashboardOptions, type DashboardPeriod } from './dashboard'
import { addCounters, emptyCounters, staffFlags, type StaffCounters, type StaffFlag } from './staff-counters'

export { addCounters, emptyCounters, hasActivity, staffFlags, type StaffCounters, type StaffFlag } from './staff-counters'

const LOOKBACK_MS = 7 * 86_400_000
const MAX_PEOPLE = 300

export interface StaffLocationActivity extends StaffCounters {
  locationId: string
  locationName: string
  brandSlug: string
  brandName: string
}

export interface StaffPerson {
  userId: string
  name: string
  /** Rol del usuario en su comercio (admin, cashier, waiter…); null si no se encontró. */
  role: string | null
  totals: StaffCounters
  prevTotals: StaffCounters
  flags: StaffFlag[]
  locations: StaffLocationActivity[]
}

export interface StaffActivity {
  organization: { name: string; slug: string }
  period: DashboardPeriod
  range: { from: string; to: string }
  compare: { range: { from: string; to: string }; label: string }
  people: StaffPerson[]
  totals: StaffCounters
  truncated: boolean
  filters: {
    available: { slug: string; name: string; locations: { id: string; name: string }[] }[]
    brands: string[]
    locations: string[]
  }
}

export type StaffActivityResult = { ok: true; data: StaffActivity } | { ok: false; reason: 'not_member' | 'role_not_allowed' }

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

type Bucket = Map<string, StaffCounters>
const bump = (b: Bucket, userId: unknown, fn: (c: StaffCounters) => void) => {
  if (userId === null || userId === undefined || userId === '') return
  const key = String(userId)
  const c = b.get(key) ?? emptyCounters()
  fn(c)
  b.set(key, c)
}

/** Actividad por persona en una sede y un rango [start, end). */
export async function locationStaffCounters(tenantId: string, locationId: string, start: Date, end: Date, endAt?: Date): Promise<Bucket> {
  const tid = new mongoose.Types.ObjectId(tenantId)
  const lid = new mongoose.Types.ObjectId(locationId)
  const stop = endAt && endAt < end ? endAt : end
  const inRange = { $gte: start, $lt: stop }
  const orderWindow = { tenantId: tid, locationId: lid, createdAt: { $gte: new Date(start.getTime() - LOOKBACK_MS), $lt: stop } }

  const [payments, voids, approvals, itemVoids, opened, closed, movements] = await Promise.all([
    Order.aggregate<{ _id: string; count: number; amount: number }>([
      { $match: { ...orderWindow, 'posPayments.paidAt': inRange, $or: [{ voided: null }, { voided: { $exists: false } }] } },
      { $unwind: '$posPayments' },
      { $match: { 'posPayments.paidAt': inRange } },
      // Una venta cobrada en partes por la misma persona cuenta una vez.
      { $group: { _id: { u: '$posPayments.userId', o: '$_id' }, amount: { $sum: '$posPayments.amount' } } },
      { $group: { _id: '$_id.u', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
    ]),
    Order.aggregate<{ _id: string; count: number; amount: number }>([
      { $match: { ...orderWindow, 'voided.at': inRange } },
      { $group: { _id: '$voided.by', count: { $sum: 1 }, amount: { $sum: '$total' } } },
    ]),
    Order.aggregate<{ _id: string; count: number }>([
      { $match: { ...orderWindow, 'voided.at': inRange } },
      { $match: { $expr: { $ne: ['$voided.by', '$voided.approvedBy'] } } },
      { $group: { _id: '$voided.approvedBy', count: { $sum: 1 } } },
    ]),
    Order.aggregate<{ _id: string; count: number; amount: number; wasted: number }>([
      { $match: { ...orderWindow, 'itemVoids.at': inRange } },
      { $unwind: '$itemVoids' },
      { $match: { 'itemVoids.at': inRange } },
      {
        $group: {
          _id: '$itemVoids.by',
          count: { $sum: '$itemVoids.quantity' },
          amount: { $sum: { $multiply: ['$itemVoids.quantity', '$itemVoids.unitPrice'] } },
          wasted: { $sum: { $cond: ['$itemVoids.wasted', '$itemVoids.quantity', 0] } },
        },
      },
    ]),
    CashRegister.aggregate<{ _id: string; count: number }>([
      { $match: { tenantId: tid, locationId: lid, openedAt: inRange, openedByUserId: { $ne: null } } },
      { $group: { _id: '$openedByUserId', count: { $sum: 1 } } },
    ]),
    CashRegister.aggregate<{ _id: string; count: number; difference: number; withDiff: number }>([
      { $match: { tenantId: tid, locationId: lid, closedAt: inRange, closedByUserId: { $ne: null } } },
      {
        $group: {
          _id: '$closedByUserId',
          count: { $sum: 1 },
          difference: { $sum: { $ifNull: ['$difference', 0] } },
          withDiff: { $sum: { $cond: [{ $and: [{ $ne: ['$difference', null] }, { $ne: ['$difference', 0] }] }, 1, 0] } },
        },
      },
    ]),
    CashMovement.aggregate<{ _id: { u: string; t: string }; count: number; amount: number }>([
      { $match: { tenantId: tid, locationId: lid, timestamp: inRange, type: { $in: ['expense', 'withdrawal', 'deposit'] } } },
      { $group: { _id: { u: '$userId', t: '$type' }, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
    ]),
  ])

  const b: Bucket = new Map()
  for (const r of payments) bump(b, r._id, c => { c.payments.count += r.count; c.payments.amount += r.amount })
  for (const r of voids) bump(b, r._id, c => { c.voidsRequested.count += r.count; c.voidsRequested.amount += r.amount })
  for (const r of approvals) bump(b, r._id, c => { c.voidsApproved += r.count })
  for (const r of itemVoids) bump(b, r._id, c => { c.itemVoids.count += r.count; c.itemVoids.amount += r.amount; c.itemVoids.wasted += r.wasted })
  for (const r of opened) bump(b, r._id, c => { c.registersOpened += r.count })
  for (const r of closed) bump(b, r._id, c => { c.registersClosed += r.count; c.cashDifference += r.difference; c.closesWithDifference += r.withDiff })
  for (const r of movements) {
    bump(b, r._id.u, c => {
      const slot = r._id.t === 'expense' ? c.expenses : r._id.t === 'withdrawal' ? c.withdrawals : c.deposits
      slot.count += r.count
      slot.amount += r.amount
    })
  }
  return b
}

async function rangeBounds(locationId: string, range: { from: string; to: string }) {
  const loc = await Location.findById(locationId).select('timezone').lean<{ timezone?: string }>()
  const tz = loc?.timezone || DEFAULT_TIMEZONE
  return { start: getDayAndMidnightInTimezone(range.from, tz).date, end: getDayAndMidnightInTimezone(nextDay(range.to), tz).date }
}

export async function loadStaffActivity(userId: string, orgSlug: string, period: DashboardPeriod, opts: DashboardOptions = {}): Promise<StaffActivityResult> {
  const mine = (await getMyOrganizations(userId)).find(o => o.organization.slug === orgSlug)
  if (!mine) return { ok: false, reason: 'not_member' }
  if (!DASHBOARD_ROLES.has(mine.orgRole)) return { ok: false, reason: 'role_not_allowed' }

  await connectDB()
  const now = opts.now ?? new Date()
  const today = getTodayStrInTimezone(DEFAULT_TIMEZONE, now)
  const effective: DashboardPeriod = period === 'custom' && !opts.range ? 'today' : period
  const range = effective === 'custom' ? opts.range! : periodRange(effective, today)
  const cmp = compareRange(effective, range, now)
  const { covered, selected, wantBrands, wantLocations } = await resolveCoverage(mine, opts)

  const perLocation = await Promise.all(selected.flatMap(({ brand, locations }) => locations.map(async l => {
    const [cur, prev] = await Promise.all([rangeBounds(l.id, range), rangeBounds(l.id, cmp.range)])
    const [curB, prevB] = await Promise.all([
      locationStaffCounters(brand.tenantId, l.id, cur.start, cur.end),
      locationStaffCounters(brand.tenantId, l.id, prev.start, prev.end, cmp.endAt),
    ])
    return { brand, location: l, cur: curB, prev: prevB }
  })))

  const people = new Map<string, { totals: StaffCounters; prevTotals: StaffCounters; locations: StaffLocationActivity[] }>()
  for (const p of perLocation) {
    for (const [uid, c] of p.cur) {
      const entry = people.get(uid) ?? { totals: emptyCounters(), prevTotals: emptyCounters(), locations: [] }
      entry.totals = addCounters(entry.totals, c)
      entry.locations.push({ ...c, locationId: p.location.id, locationName: p.location.name, brandSlug: p.brand.slug, brandName: p.brand.name })
      people.set(uid, entry)
    }
  }
  // Período anterior solo para quienes trabajaron en este (comparar su propio ritmo).
  for (const p of perLocation) {
    for (const [uid, c] of p.prev) {
      const entry = people.get(uid)
      if (entry) entry.prevTotals = addCounters(entry.prevTotals, c)
    }
  }

  const ranked = [...people.entries()].sort((a, b) => b[1].totals.payments.amount - a[1].totals.payments.amount || b[1].totals.registersClosed - a[1].totals.registersClosed)
  const truncated = ranked.length > MAX_PEOPLE
  const list = ranked.slice(0, MAX_PEOPLE)

  // Nombres: solo de usuarios que pertenecen a las marcas cubiertas (un id
  // ajeno no revela a quién corresponde).
  const tenantIds = mine.brands.map(b => new mongoose.Types.ObjectId(b.tenantId))
  const ids = list.map(([id]) => id).filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id))
  const users = ids.length
    ? await User.find({ _id: { $in: ids }, $or: [{ tenantId: { $in: tenantIds } }, { role: 'member' }] }).select('name role').lean<{ _id: mongoose.Types.ObjectId; name?: string; role?: string }[]>()
    : []
  const byId = new Map(users.map(u => [String(u._id), u]))

  const result: StaffPerson[] = list.map(([id, e]) => {
    const u = byId.get(id)
    return {
      userId: id,
      name: u?.name?.trim() || 'Persona sin identificar',
      role: u?.role ?? null,
      totals: e.totals,
      prevTotals: e.prevTotals,
      flags: staffFlags(e.totals),
      locations: e.locations.sort((a, b) => b.payments.amount - a.payments.amount),
    }
  })

  return {
    ok: true,
    data: {
      organization: { name: mine.organization.name, slug: mine.organization.slug },
      period: effective,
      range,
      compare: { range: cmp.range, label: cmp.label },
      people: result,
      totals: result.reduce((acc, p) => addCounters(acc, p.totals), emptyCounters()),
      truncated,
      filters: {
        available: covered.map(c => ({ slug: c.brand.slug, name: c.brand.name, locations: c.locations })),
        brands: [...wantBrands],
        locations: [...wantLocations],
      },
    },
  }
}
