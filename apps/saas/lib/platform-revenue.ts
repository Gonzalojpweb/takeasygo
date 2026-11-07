/**
 * lib/platform-revenue.ts — ingresos de la plataforma por comercio (superadmin).
 *
 * Fuente: la comisión guardada en cada pedido (payment.platformFeeAmount, en
 * centavos) de los pedidos con pago aprobado, no cancelados ni borrados. Es
 * el mismo criterio que la página de Comisiones. Se agrupa por día en hora
 * argentina en la base y se pliega a semana (lunes a domingo, como los
 * resúmenes semanales) o a mes.
 *
 * Además, por comercio (a hoy, no del período):
 *   · deuda de comisiones por transferencia/efectivo (resúmenes pendientes o
 *     vencidos de WeeklyCommissionStatement);
 *   · si Mercado Pago cobra la comisión solo (cuenta conectada por OAuth);
 *   · abono mensual según su plan, solo como referencia: no hay historial de
 *     cobros de suscripciones, se muestra aparte y no se suma a comisiones.
 */
import mongoose from 'mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import WeeklyCommissionStatement from '@/models/WeeklyCommissionStatement'
import { weekKeyOf } from '@/lib/commission-weeks'
import { DEFAULT_TIMEZONE, addDaysToDateStr, getDayAndMidnightInTimezone, getTodayStrInTimezone } from '@/lib/restaurant-time'
import { PLAN_PRICE, PLAN_LABELS } from '@/lib/plans'

export const REVENUE_METHODS = ['transfer', 'mercadopago', 'cash', 'kripton', 'other'] as const
export type RevenueMethod = (typeof REVENUE_METHODS)[number]
export type ByMethod = Record<RevenueMethod, number>
export type RevenueGroup = 'week' | 'month'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const emptyByMethod = (): ByMethod => ({ transfer: 0, mercadopago: 0, cash: 0, kripton: 0, other: 0 })
const methodOf = (m: unknown): RevenueMethod => (REVENUE_METHODS as readonly string[]).includes(String(m)) && m !== 'other' ? (m as RevenueMethod) : 'other'

export interface RevenueRange { from: string; to: string }

/** Rango válido en días de Argentina; por defecto, el mes en curso. Máximo un año. */
export function parseRevenueRange(from?: string | null, to?: string | null, today = getTodayStrInTimezone(DEFAULT_TIMEZONE)): RevenueRange {
  const f = from && DATE_RE.test(from) ? from : `${today.slice(0, 7)}-01`
  const t = to && DATE_RE.test(to) ? to : today
  if (t < f) throw new RangeError('La fecha «hasta» es anterior a «desde».')
  if ((Date.parse(t) - Date.parse(f)) / 86_400_000 > 366) throw new RangeError('El rango máximo es de un año.')
  return { from: f, to: t }
}

/** Clave de agrupación de un día local «YYYY-MM-DD». Pura. */
export function bucketOf(day: string, group: RevenueGroup): string {
  if (group === 'month') return day.slice(0, 7)
  return weekKeyOf(getDayAndMidnightInTimezone(day, DEFAULT_TIMEZONE).date)
}

/** Abono mensual en centavos según el texto de precio del plan («$35.000 ARS/mes»). */
export function planMonthlyCents(plan: string | null | undefined): number | null {
  const price = plan ? (PLAN_PRICE as Record<string, string>)[plan] : undefined
  const m = price?.match(/\$\s*([\d.]+)/)
  return m ? Number(m[1].replace(/\./g, '')) * 100 : null
}

export interface RevenueBucket { key: string; total: number; byMethod: ByMethod; gmv: number; orders: number }

export interface TenantRevenue {
  tenantId: string
  name: string
  slug: string
  plan: string
  planLabel: string
  subscriptionStatus: string | null
  /** Abono mensual según plan (referencia; null si el plan no tiene precio). */
  monthlyFee: number | null
  mpAutoSplit: boolean
  commission: number
  byMethod: ByMethod
  gmv: number
  orders: number
  /** % de los ingresos por comisión de la plataforma en el período. */
  share: number
  /** Comisión / facturación procesada, en %. */
  effectiveRate: number
  /** Deuda de comisiones manuales a hoy (resúmenes pendientes o vencidos). */
  manualDebt: number
}

export interface PlatformRevenue {
  range: RevenueRange
  group: RevenueGroup
  totals: { commission: number; byMethod: ByMethod; gmv: number; orders: number; effectiveRate: number; mpAutoSplit: number; mpManual: number; manualDebt: number; monthlyFees: number }
  series: RevenueBucket[]
  tenants: TenantRevenue[]
}

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0)

export async function loadPlatformRevenue(opts: { range: RevenueRange; group: RevenueGroup; tenantId?: string | null }): Promise<PlatformRevenue> {
  const { range, group } = opts
  const start = getDayAndMidnightInTimezone(range.from, DEFAULT_TIMEZONE).date
  const end = getDayAndMidnightInTimezone(addDaysToDateStr(range.to, 1), DEFAULT_TIMEZONE).date
  const tenantFilter = opts.tenantId && mongoose.Types.ObjectId.isValid(opts.tenantId) ? new mongoose.Types.ObjectId(opts.tenantId) : null

  const rows = await Order.aggregate<{ _id: { day: string; tenantId: mongoose.Types.ObjectId; method: string | null }; fee: number; gmv: number; orders: number }>([
    {
      $match: {
        ...(tenantFilter ? { tenantId: tenantFilter } : {}),
        deletedAt: null,
        status: { $ne: 'cancelled' },
        'payment.status': 'approved',
        createdAt: { $gte: start, $lt: end },
      },
    },
    {
      $group: {
        _id: {
          day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: DEFAULT_TIMEZONE } },
          tenantId: '$tenantId',
          method: '$payment.method',
        },
        fee: { $sum: { $ifNull: ['$payment.platformFeeAmount', 0] } },
        gmv: { $sum: { $ifNull: ['$total', 0] } },
        orders: { $sum: 1 },
      },
    },
  ])

  const tenantDocs = await Tenant.find({ ...(tenantFilter ? { _id: tenantFilter } : {}), status: { $ne: 'deleted' } })
    .select('_id name slug plan subscription.status mpOAuth.isConnected')
    .lean<{ _id: mongoose.Types.ObjectId; name: string; slug: string; plan?: string; subscription?: { status?: string | null }; mpOAuth?: { isConnected?: boolean } }[]>()
  const debts = await WeeklyCommissionStatement.aggregate<{ _id: mongoose.Types.ObjectId; debt: number }>([
    { $match: { ...(tenantFilter ? { tenantId: tenantFilter } : {}), status: { $in: ['pendiente', 'vencido'] } } },
    { $group: { _id: '$tenantId', debt: { $sum: '$amount' } } },
  ])
  const debtBy = new Map(debts.map(d => [String(d._id), d.debt]))

  const buckets = new Map<string, RevenueBucket>()
  const byTenant = new Map<string, { byMethod: ByMethod; commission: number; gmv: number; orders: number }>()
  for (const r of rows) {
    const method = methodOf(r._id.method)
    const key = bucketOf(r._id.day, group)
    const b = buckets.get(key) ?? { key, total: 0, byMethod: emptyByMethod(), gmv: 0, orders: 0 }
    b.total += r.fee; b.byMethod[method] += r.fee; b.gmv += r.gmv; b.orders += r.orders
    buckets.set(key, b)
    const tid = String(r._id.tenantId)
    const t = byTenant.get(tid) ?? { byMethod: emptyByMethod(), commission: 0, gmv: 0, orders: 0 }
    t.commission += r.fee; t.byMethod[method] += r.fee; t.gmv += r.gmv; t.orders += r.orders
    byTenant.set(tid, t)
  }

  // Todas las semanas o meses del rango, aunque no tengan ventas.
  const keys: string[] = []
  for (let d = range.from; d <= range.to; d = addDaysToDateStr(d, 1)) {
    const k = bucketOf(d, group)
    if (keys[keys.length - 1] !== k) keys.push(k)
  }
  const series = keys.map(k => buckets.get(k) ?? { key: k, total: 0, byMethod: emptyByMethod(), gmv: 0, orders: 0 })

  const totalCommission = series.reduce((s, b) => s + b.total, 0)
  const tenants: TenantRevenue[] = tenantDocs.map(t => {
    const r = byTenant.get(String(t._id)) ?? { byMethod: emptyByMethod(), commission: 0, gmv: 0, orders: 0 }
    const plan = t.plan ?? ''
    const subscriptionStatus = t.subscription?.status ?? null
    return {
      tenantId: String(t._id), name: t.name, slug: t.slug, plan,
      planLabel: (PLAN_LABELS as Record<string, string>)[plan] ?? plan,
      subscriptionStatus,
      monthlyFee: planMonthlyCents(plan),
      mpAutoSplit: Boolean(t.mpOAuth?.isConnected),
      commission: r.commission, byMethod: r.byMethod, gmv: r.gmv, orders: r.orders,
      share: pct(r.commission, totalCommission),
      effectiveRate: pct(r.commission, r.gmv),
      manualDebt: debtBy.get(String(t._id)) ?? 0,
    }
  }).sort((a, b) => b.commission - a.commission || a.name.localeCompare(b.name, 'es'))

  const byMethod = emptyByMethod()
  for (const b of series) for (const m of REVENUE_METHODS) byMethod[m] += b.byMethod[m]
  const gmv = series.reduce((s, b) => s + b.gmv, 0)
  const mpAutoSplit = tenants.filter(t => t.mpAutoSplit).reduce((s, t) => s + t.byMethod.mercadopago, 0)

  return {
    range, group, series, tenants,
    totals: {
      commission: totalCommission, byMethod, gmv,
      orders: series.reduce((s, b) => s + b.orders, 0),
      effectiveRate: pct(totalCommission, gmv),
      mpAutoSplit,
      mpManual: byMethod.mercadopago - mpAutoSplit,
      manualDebt: tenants.reduce((s, t) => s + t.manualDebt, 0),
      monthlyFees: tenants.filter(t => t.subscriptionStatus === 'authorized').reduce((s, t) => s + (t.monthlyFee ?? 0), 0),
    },
  }
}
