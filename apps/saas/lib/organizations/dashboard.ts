/**
 * lib/organizations/dashboard.ts — números del grupo (multi-marca PR 10).
 *
 * Solo lectura. Suma las ventas de las marcas de una organización con el
 * mismo cálculo que el panel de cada comercio (lib/metrics/sales): los
 * números coinciden con los de cada marca.
 *
 * Alcance, siempre derivado en el servidor desde la membresía (nunca de lo
 * que mande el cliente):
 *   · owner, org_admin, accountant (D4: lectura) → las marcas que su
 *     membresía cubre.
 *   · brand_manager → solo sus marcas.
 *   · location_manager / operations → no ven el consolidado (diseño §4).
 * Sin datos de clientes: solo totales, canales y medios de pago.
 */
import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import { loadSalesMetrics, mergeChannelTotals, type SaleChannel, type SalesMetrics } from '@/lib/metrics/sales'
import { DEFAULT_TIMEZONE, getTodayStrInTimezone } from '@/lib/restaurant-time'
import type { OrgRole } from '@/models/OrgMembership'
import { getMyOrganizations } from './me'

export const DASHBOARD_ROLES: ReadonlySet<OrgRole> = new Set<OrgRole>(['owner', 'org_admin', 'brand_manager', 'accountant'])

export type DashboardPeriod = 'today' | 'yesterday' | '7d' | '30d' | 'month'
export const DASHBOARD_PERIODS: { id: DashboardPeriod; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: '7d', label: 'Últimos 7 días' },
  { id: '30d', label: 'Últimos 30 días' },
  { id: 'month', label: 'Este mes' },
]

function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
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
  return DASHBOARD_PERIODS.some(p => p.id === value) ? (value as DashboardPeriod) : 'today'
}

type Totals = ReturnType<typeof mergeChannelTotals>['totals']

export interface DashboardRow {
  name: string
  totals: Totals
  byChannel: Record<SaleChannel, { sales: number; revenue: number }>
}

export interface BrandDashboard extends DashboardRow {
  slug: string
  locations: DashboardRow[]
}

export interface OrgDashboard {
  organization: { name: string; slug: string }
  orgRole: OrgRole
  period: DashboardPeriod
  range: { from: string; to: string }
  totals: Totals
  byChannel: Record<SaleChannel, { sales: number; revenue: number }>
  byPayment: { method: string; amount: number; count: number }[]
  brands: BrandDashboard[]
}

export type OrgDashboardResult =
  | { ok: true; data: OrgDashboard }
  | { ok: false; reason: 'not_member' | 'role_not_allowed' }

function row(name: string, list: SalesMetrics[]): DashboardRow {
  const merged = mergeChannelTotals(list)
  const byChannel = Object.fromEntries(
    Object.entries(merged.byChannel).map(([c, v]) => [c, { sales: v.sales, revenue: v.revenue }]),
  ) as DashboardRow['byChannel']
  return { name, totals: merged.totals, byChannel }
}

export async function loadOrgDashboard(userId: string, orgSlug: string, period: DashboardPeriod): Promise<OrgDashboardResult> {
  const mine = (await getMyOrganizations(userId)).find(o => o.organization.slug === orgSlug)
  if (!mine) return { ok: false, reason: 'not_member' }
  if (!DASHBOARD_ROLES.has(mine.orgRole)) return { ok: false, reason: 'role_not_allowed' }

  await connectDB()
  const range = periodRange(period)
  const brands: BrandDashboard[] = []
  const all: SalesMetrics[] = []

  for (const brand of mine.brands) {
    // brands viene de effectiveGrant: solo marcas que la membresía cubre.
    const locations = await Location.find({ tenantId: brand.tenantId, isActive: true })
      .select('_id name').sort({ name: 1 }).lean<{ _id: unknown; name?: string }[]>()
    const perLocation = await Promise.all(
      locations.map(l => loadSalesMetrics(brand.tenantId, String(l._id), range).then(r => ({ name: l.name ?? 'Sede', metrics: r.metrics }))),
    )
    all.push(...perLocation.map(p => p.metrics))
    brands.push({
      slug: brand.slug,
      ...row(brand.name, perLocation.map(p => p.metrics)),
      locations: perLocation.map(p => row(p.name, [p.metrics])),
    })
  }

  const payments = new Map<string, { amount: number; count: number }>()
  for (const m of all) {
    for (const p of m.byPayment) {
      const cur = payments.get(p.method) ?? { amount: 0, count: 0 }
      cur.amount += p.amount
      cur.count += p.count
      payments.set(p.method, cur)
    }
  }
  const total = row(mine.organization.name, all)

  return {
    ok: true,
    data: {
      organization: { name: mine.organization.name, slug: mine.organization.slug },
      orgRole: mine.orgRole,
      period,
      range,
      totals: total.totals,
      byChannel: total.byChannel,
      byPayment: [...payments.entries()].map(([method, v]) => ({ method, ...v })).sort((a, b) => b.amount - a.amount),
      brands: brands.sort((a, b) => b.totals.revenue - a.totals.revenue),
    },
  }
}
