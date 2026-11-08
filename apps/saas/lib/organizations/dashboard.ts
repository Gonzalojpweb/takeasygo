/**
 * lib/organizations/dashboard.ts — números del grupo: vista 360 del dueño.
 *
 * Multi-marca PR 10 + etapas 1 y 2 del tablero (08/11/2026). Solo lectura.
 * Suma las ventas de las marcas de una organización con el mismo cálculo que
 * el panel de cada comercio (lib/metrics/sales): los números coinciden con
 * los de cada marca.
 *
 *  Etapa 1 — cómo vengo: totales con variación contra el período anterior
 *  equivalente («hoy» contra el mismo día de la semana pasada HASTA LA MISMA
 *  HORA), serie por día (o por hora en «hoy/ayer») con una línea por marca,
 *  ranking de sedes con variación, filtros de marca/sede y fechas a elección.
 *  Etapa 2 — dónde está la plata: productos y categorías del grupo con su
 *  variación, mapa de horas pico (día de semana × hora), canales y medios de
 *  pago contra el período anterior, margen por marca donde hay recetas.
 *
 * Alcance, siempre derivado en el servidor desde la membresía (nunca de lo
 * que mande el cliente; los filtros solo ACHICAN lo que la membresía cubre):
 *   · owner, org_admin, accountant (D4: lectura) → las marcas que su
 *     membresía cubre.
 *   · brand_manager → solo sus marcas.
 *   · location_manager / operations → no ven el consolidado (diseño §4).
 * Sin datos de clientes: solo totales, canales, medios de pago y productos.
 */
import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import { loadSalesMetrics, mergeChannelTotals, SALE_CHANNELS, type SaleChannel, type SalesMetrics } from '@/lib/metrics/sales'
import { DEFAULT_TIMEZONE, getTodayStrInTimezone } from '@/lib/restaurant-time'
import { dishCostsForLocation } from '@/lib/inventory/read'
import type { OrgRole } from '@/models/OrgMembership'
import { getMyOrganizations } from './me'

export const DASHBOARD_ROLES: ReadonlySet<OrgRole> = new Set<OrgRole>(['owner', 'org_admin', 'brand_manager', 'accountant'])

export type DashboardPeriod = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom'
export const DASHBOARD_PERIODS: { id: Exclude<DashboardPeriod, 'custom'>; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: '7d', label: 'Últimos 7 días' },
  { id: '30d', label: 'Últimos 30 días' },
  { id: 'month', label: 'Este mes' },
]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_CUSTOM_DAYS = 366

function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)
}

/** Días del rango, inclusive. */
export function datesOf(range: { from: string; to: string }): string[] {
  const out: string[] = []
  for (let d = range.from; d <= range.to && out.length <= MAX_CUSTOM_DAYS; d = shiftDay(d, 1)) out.push(d)
  return out
}

/** Rango de días (zona Argentina) de un período. Puro: `today` se inyecta en tests. */
export function periodRange(period: DashboardPeriod, today = getTodayStrInTimezone(DEFAULT_TIMEZONE)): { from: string; to: string } {
  switch (period) {
    case 'yesterday': { const y = shiftDay(today, -1); return { from: y, to: y } }
    case '7d': return { from: shiftDay(today, -6), to: today }
    case '30d': return { from: shiftDay(today, -29), to: today }
    case 'month': return { from: `${today.slice(0, 7)}-01`, to: today }
    default: return { from: today, to: today }
  }
}

export function parsePeriod(value: unknown): DashboardPeriod {
  return value === 'custom' || DASHBOARD_PERIODS.some(p => p.id === value) ? (value as DashboardPeriod) : 'today'
}

/** Rango a elección: válido, no al revés, no futuro, como mucho un año. null si no sirve. */
export function parseCustomRange(from: unknown, to: unknown, today = getTodayStrInTimezone(DEFAULT_TIMEZONE)): { from: string; to: string } | null {
  if (typeof from !== 'string' || typeof to !== 'string' || !DATE_RE.test(from) || !DATE_RE.test(to)) return null
  if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) return null
  const t = to > today ? today : to
  if (from > t || daysBetween(from, t) > MAX_CUSTOM_DAYS - 1) return null
  return { from, to: t }
}

/**
 * Período con el que se compara. Puro (today y now se inyectan en tests).
 *  · hoy  → el mismo día de la semana pasada, hasta la misma hora.
 *  · ayer → el mismo día de la semana pasada.
 *  · este mes → los mismos días del mes anterior.
 *  · 7/30 días y a elección → la misma cantidad de días justo antes.
 */
export function compareRange(
  period: DashboardPeriod,
  range: { from: string; to: string },
  now: Date = new Date(),
): { range: { from: string; to: string }; endAt?: Date; label: string } {
  if (period === 'today') {
    return { range: { from: shiftDay(range.from, -7), to: shiftDay(range.to, -7) }, endAt: new Date(now.getTime() - 7 * 86_400_000), label: 'vs. el mismo día de la semana pasada a esta hora' }
  }
  if (period === 'yesterday') {
    return { range: { from: shiftDay(range.from, -7), to: shiftDay(range.to, -7) }, label: 'vs. el mismo día de la semana pasada' }
  }
  if (period === 'month') {
    const [y, m] = range.from.split('-').map(Number)
    const prevY = m === 1 ? y - 1 : y
    const prevM = m === 1 ? 12 : m - 1
    const lastDayPrev = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate()
    const day = Math.min(Number(range.to.slice(8, 10)), lastDayPrev)
    const pm = String(prevM).padStart(2, '0')
    return { range: { from: `${prevY}-${pm}-01`, to: `${prevY}-${pm}-${String(day).padStart(2, '0')}` }, label: 'vs. los mismos días del mes pasado' }
  }
  const len = daysBetween(range.from, range.to) + 1
  return {
    range: { from: shiftDay(range.from, -len), to: shiftDay(range.from, -1) },
    label: len === 1 ? 'vs. el día anterior' : `vs. los ${len} días anteriores`,
  }
}

type Totals = ReturnType<typeof mergeChannelTotals>['totals']

export interface DashboardRow {
  name: string
  totals: Totals
  byChannel: Record<SaleChannel, { sales: number; revenue: number }>
}

export interface BrandDashboard extends DashboardRow {
  slug: string
  prevTotals: Totals
  /** Margen teórico por recetas; null si la marca no tiene recetas cargadas. */
  margin: { costedRevenue: number; cogs: number; marginPct: number; coveragePct: number } | null
  locations: DashboardRow[]
}

export interface LocationRank {
  brandSlug: string
  brandName: string
  locationId: string
  name: string
  revenue: number
  prevRevenue: number
  sales: number
  prevSales: number
  avgTicket: number
  share: number
}

export interface MoneyRow { revenue: number; prevRevenue: number; quantity: number }

export interface OrgDashboard {
  organization: { name: string; slug: string }
  orgRole: OrgRole
  period: DashboardPeriod
  range: { from: string; to: string }
  compare: { range: { from: string; to: string }; label: string; totals: Totals; extras: Extras }
  totals: Totals
  extras: Extras
  byChannel: Record<SaleChannel, { sales: number; revenue: number }>
  prevByChannel: Record<SaleChannel, { sales: number; revenue: number }>
  byPayment: { method: string; amount: number; count: number; prevAmount: number }[]
  brands: BrandDashboard[]
  locations: LocationRank[]
  series: { unit: 'day' | 'hour'; labels: string[]; total: number[]; prevTotal: number[]; byBrand: { slug: string; name: string; values: number[] }[] }
  products: (MoneyRow & { name: string; brands: string[] })[]
  categories: (MoneyRow & { category: string })[]
  heatmap: number[][]
  filters: {
    available: { slug: string; name: string; locations: { id: string; name: string }[] }[]
    brands: string[]
    locations: string[]
  }
}

export interface Extras { discounts: number; voided: { count: number; amount: number }; itemVoids: { count: number; amount: number } }

export type OrgDashboardResult =
  | { ok: true; data: OrgDashboard }
  | { ok: false; reason: 'not_member' | 'role_not_allowed' }

export interface DashboardOptions {
  /** Para period = 'custom'. */
  range?: { from: string; to: string }
  /** Slugs de marca a mostrar (dentro de lo que la membresía cubre). Vacío = todas. */
  brands?: string[]
  /** Ids de sede a mostrar. Vacío = todas. */
  locations?: string[]
  now?: Date
}

function channelMoney(byChannel: Record<SaleChannel, { sales: number; revenue: number }>) {
  return Object.fromEntries(Object.entries(byChannel).map(([c, v]) => [c, { sales: v.sales, revenue: v.revenue }])) as Record<SaleChannel, { sales: number; revenue: number }>
}

function row(name: string, list: SalesMetrics[]): DashboardRow {
  const merged = mergeChannelTotals(list)
  return { name, totals: merged.totals, byChannel: channelMoney(merged.byChannel) }
}

function extrasOf(list: SalesMetrics[]): Extras {
  const e: Extras = { discounts: 0, voided: { count: 0, amount: 0 }, itemVoids: { count: 0, amount: 0 } }
  for (const m of list) {
    e.discounts += m.totals.discounts
    e.voided.count += m.totals.voided.count
    e.voided.amount += m.totals.voided.amount
    e.itemVoids.count += m.totals.itemVoids.count
    e.itemVoids.amount += m.totals.itemVoids.amount
  }
  return e
}

function sumBy<K>(list: SalesMetrics[], pick: (m: SalesMetrics) => { key: K; revenue: number; quantity: number }[]): Map<K, { revenue: number; quantity: number }> {
  const out = new Map<K, { revenue: number; quantity: number }>()
  for (const m of list) {
    for (const r of pick(m)) {
      const cur = out.get(r.key) ?? { revenue: 0, quantity: 0 }
      cur.revenue += r.revenue
      cur.quantity += r.quantity
      out.set(r.key, cur)
    }
  }
  return out
}

function seriesOf(list: SalesMetrics[], unit: 'day' | 'hour', labels: string[]): number[] {
  if (unit === 'hour') {
    const out = Array.from({ length: 24 }, () => 0)
    for (const m of list) for (const h of m.byHour) out[h.hour] += h.revenue
    return out
  }
  const idx = new Map(labels.map((d, i) => [d, i]))
  const out = labels.map(() => 0)
  for (const m of list) for (const d of m.byDay) { const i = idx.get(d.date); if (i !== undefined) out[i] += d.revenue }
  return out
}

const PRODUCT_LIMIT = 300

export async function loadOrgDashboard(userId: string, orgSlug: string, period: DashboardPeriod, opts: DashboardOptions = {}): Promise<OrgDashboardResult> {
  const mine = (await getMyOrganizations(userId)).find(o => o.organization.slug === orgSlug)
  if (!mine) return { ok: false, reason: 'not_member' }
  if (!DASHBOARD_ROLES.has(mine.orgRole)) return { ok: false, reason: 'role_not_allowed' }

  await connectDB()
  const now = opts.now ?? new Date()
  const today = getTodayStrInTimezone(DEFAULT_TIMEZONE, now)
  const effectivePeriod: DashboardPeriod = period === 'custom' && !opts.range ? 'today' : period
  const range = effectivePeriod === 'custom' ? opts.range! : periodRange(effectivePeriod, today)
  const cmp = compareRange(effectivePeriod, range, now)
  const unit: 'day' | 'hour' = range.from === range.to ? 'hour' : 'day'
  const labels = unit === 'hour' ? Array.from({ length: 24 }, (_, h) => String(h)) : datesOf(range)
  const prevLabels = unit === 'hour' ? labels : datesOf(cmp.range)

  // Todas las sedes que la membresía cubre (para los filtros), en paralelo.
  const covered = await Promise.all(mine.brands.map(async brand => ({
    brand,
    locations: (await Location.find({ tenantId: brand.tenantId, isActive: true }).select('_id name').sort({ name: 1 })
      .lean<{ _id: unknown; name?: string }[]>()).map(l => ({ id: String(l._id), name: l.name ?? 'Sede' })),
  })))

  // Los filtros solo achican: lo que no está cubierto se ignora.
  const wantBrands = new Set((opts.brands ?? []).filter(s => covered.some(c => c.brand.slug === s)))
  const wantLocations = new Set((opts.locations ?? []).filter(id => covered.some(c => c.locations.some(l => l.id === id))))
  const selected = covered
    .filter(c => !wantBrands.size || wantBrands.has(c.brand.slug))
    .map(c => ({ ...c, locations: c.locations.filter(l => !wantLocations.size || wantLocations.has(l.id)) }))
    .filter(c => c.locations.length > 0 || !wantLocations.size)

  const perBrand = await Promise.all(selected.map(async ({ brand, locations }) => {
    const perLocation = await Promise.all(locations.map(async l => {
      const costByItem = await dishCostsForLocation(brand.tenantId, l.id).catch(() => new Map<string, number>())
      const [cur, prev] = await Promise.all([
        loadSalesMetrics(brand.tenantId, l.id, range, { productLimit: PRODUCT_LIMIT, costByItem }),
        loadSalesMetrics(brand.tenantId, l.id, cmp.range, { productLimit: PRODUCT_LIMIT, endAt: cmp.endAt }),
      ])
      return { location: l, cur: cur.metrics, prev: prev.metrics }
    }))
    return { brand, perLocation }
  }))

  const allCur = perBrand.flatMap(b => b.perLocation.map(p => p.cur))
  const allPrev = perBrand.flatMap(b => b.perLocation.map(p => p.prev))
  const total = row(mine.organization.name, allCur)
  const prevTotal = row(mine.organization.name, allPrev)

  const brands: BrandDashboard[] = perBrand.map(({ brand, perLocation }) => {
    const cur = perLocation.map(p => p.cur)
    const r = row(brand.name, cur)
    const costedRevenue = cur.reduce((s, m) => s + m.cost.costedRevenue, 0)
    const cogs = cur.reduce((s, m) => s + m.cost.cogs, 0)
    return {
      slug: brand.slug,
      ...r,
      prevTotals: row(brand.name, perLocation.map(p => p.prev)).totals,
      margin: costedRevenue > 0
        ? { costedRevenue, cogs, marginPct: Math.round(((costedRevenue - cogs) / costedRevenue) * 1000) / 10, coveragePct: r.totals.revenue ? Math.round((costedRevenue / r.totals.revenue) * 100) : 0 }
        : null,
      locations: perLocation.map(p => row(p.location.name, [p.cur])),
    }
  }).sort((a, b) => b.totals.revenue - a.totals.revenue)

  const locations: LocationRank[] = perBrand.flatMap(({ brand, perLocation }) => perLocation.map(p => ({
    brandSlug: brand.slug,
    brandName: brand.name,
    locationId: p.location.id,
    name: p.location.name,
    revenue: p.cur.totals.revenue,
    prevRevenue: p.prev.totals.revenue,
    sales: p.cur.totals.sales,
    prevSales: p.prev.totals.sales,
    avgTicket: p.cur.totals.avgTicket,
    share: total.totals.revenue ? Math.round((p.cur.totals.revenue / total.totals.revenue) * 1000) / 10 : 0,
  }))).sort((a, b) => b.revenue - a.revenue)

  const payments = new Map<string, { amount: number; count: number; prevAmount: number }>()
  for (const m of allCur) for (const p of m.byPayment) {
    const c = payments.get(p.method) ?? { amount: 0, count: 0, prevAmount: 0 }
    c.amount += p.amount; c.count += p.count; payments.set(p.method, c)
  }
  for (const m of allPrev) for (const p of m.byPayment) {
    const c = payments.get(p.method) ?? { amount: 0, count: 0, prevAmount: 0 }
    c.prevAmount += p.amount; payments.set(p.method, c)
  }

  // Productos del grupo (mismo nombre en dos marcas se suma; se anota en cuáles).
  const prodCur = sumBy(allCur, m => m.topProducts.map(p => ({ key: p.name, revenue: p.revenue, quantity: p.quantity })))
  const prodPrev = sumBy(allPrev, m => m.topProducts.map(p => ({ key: p.name, revenue: p.revenue, quantity: p.quantity })))
  const prodBrands = new Map<string, Set<string>>()
  for (const { brand, perLocation } of perBrand) for (const p of perLocation) for (const t of p.cur.topProducts) {
    const set = prodBrands.get(t.name) ?? new Set<string>(); set.add(brand.name); prodBrands.set(t.name, set)
  }
  const products = [...new Set([...prodCur.keys(), ...prodPrev.keys()])].map(name => ({
    name,
    revenue: prodCur.get(name)?.revenue ?? 0,
    quantity: prodCur.get(name)?.quantity ?? 0,
    prevRevenue: prodPrev.get(name)?.revenue ?? 0,
    brands: [...(prodBrands.get(name) ?? [])],
  })).sort((a, b) => b.revenue - a.revenue).slice(0, 200)

  const catCur = sumBy(allCur, m => m.byCategory.map(c => ({ key: c.category, revenue: c.revenue, quantity: c.quantity })))
  const catPrev = sumBy(allPrev, m => m.byCategory.map(c => ({ key: c.category, revenue: c.revenue, quantity: c.quantity })))
  const categories = [...new Set([...catCur.keys(), ...catPrev.keys()])].map(category => ({
    category,
    revenue: catCur.get(category)?.revenue ?? 0,
    quantity: catCur.get(category)?.quantity ?? 0,
    prevRevenue: catPrev.get(category)?.revenue ?? 0,
  })).sort((a, b) => b.revenue - a.revenue)

  const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (const m of allCur) m.byWeekdayHour.forEach((hours, d) => hours.forEach((v, h) => { heatmap[d][h] += v }))

  return {
    ok: true,
    data: {
      organization: { name: mine.organization.name, slug: mine.organization.slug },
      orgRole: mine.orgRole,
      period: effectivePeriod,
      range,
      compare: { range: cmp.range, label: cmp.label, totals: prevTotal.totals, extras: extrasOf(allPrev) },
      totals: total.totals,
      extras: extrasOf(allCur),
      byChannel: total.byChannel,
      prevByChannel: prevTotal.byChannel,
      byPayment: [...payments.entries()].map(([method, v]) => ({ method, ...v })).filter(p => p.amount > 0 || p.prevAmount > 0).sort((a, b) => b.amount - a.amount),
      brands,
      locations,
      series: {
        unit,
        labels,
        total: seriesOf(allCur, unit, labels),
        prevTotal: seriesOf(allPrev, unit, prevLabels),
        byBrand: perBrand.map(({ brand, perLocation }) => ({ slug: brand.slug, name: brand.name, values: seriesOf(perLocation.map(p => p.cur), unit, labels) })),
      },
      products,
      categories,
      heatmap,
      filters: {
        available: covered.map(c => ({ slug: c.brand.slug, name: c.brand.name, locations: c.locations })),
        brands: [...wantBrands],
        locations: [...wantLocations],
      },
    },
  }
}

export { SALE_CHANNELS }
