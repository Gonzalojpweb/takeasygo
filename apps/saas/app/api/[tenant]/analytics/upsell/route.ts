import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { requireAuth } from '@/lib/apiAuth'
import { NextRequest, NextResponse } from 'next/server'
import { canAccess } from '@/lib/plans'
import type { Plan } from '@/lib/plans'
import { UPSELL_SOURCES } from '@/lib/constants/upsell'
import { buildPeriodLabel, fmtDate } from '@/lib/report-range'

/** Ventana por defecto cuando no se envía `?days=` ni `?from=&to=`. */
const DEFAULT_WINDOW_DAYS = 90
const MAX_WINDOW_DAYS = 730

/**
 * Resuelve el rango a partir de `?from=&?to=` (prioridad) o `?days=`.
 * Devuelve `null` si las fechas no son `YYYY-MM-DD` válidas.
 */
function resolveRange(searchParams: URLSearchParams): { start: Date; end: Date; from: string; to: string } | null {
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const now = new Date()
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  if (from || to) {
    const [fy, fm, fd] = from.split('-').map(Number)
    const [ty, tm, td] = to.split('-').map(Number)
    if (
      ![fy, fm, fd, ty, tm, td].every(Number.isInteger) ||
      fm < 1 || fm > 12 || tm < 1 || tm > 12 ||
      fd < 1 || fd > 31 || td < 1 || td > 31
    ) {
      return null
    }
    const start = new Date(fy, fm - 1, fd, 0, 0, 0, 0)
    const end = new Date(ty, tm - 1, td, 23, 59, 59, 999)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return null
    return { start, end, from: fmtDate(start), to: fmtDate(end) }
  }

  const rawDays = Number(searchParams.get('days'))
  const days =
    Number.isFinite(rawDays) && rawDays > 0
      ? Math.min(Math.trunc(rawDays), MAX_WINDOW_DAYS)
      : DEFAULT_WINDOW_DAYS

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  start.setDate(start.getDate() - days)
  return { start, end: endOfDay, from: fmtDate(start), to: fmtDate(now) }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> },
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id plan')
      .lean<{ _id: import('mongoose').Types.ObjectId; plan: Plan }>()
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    if (!canAccess(tenant.plan ?? 'try', 'reports')) {
      return NextResponse.json({ error: 'Plan insuficiente' }, { status: 403 })
    }

    const tenantId = tenant._id

    const range = resolveRange(request.nextUrl.searchParams)
    if (!range) {
      return NextResponse.json(
        { error: 'Rango de fechas inválido (usá ?days=N o ?from=YYYY-MM-DD&to=YYYY-MM-DD)' },
        { status: 400 },
      )
    }

    // Agrupación 1: cuántas veces cada ítem fue agregado via upsell (en cualquier orden)
    // Agrupación 2: cuántas veces cada ítem upsell terminó en una orden pagada (approved)
    // Mismo criterio que /admin/reports: sin cancelados y sin borrados.
    const [addsData, conversionsData] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            tenantId,
            deletedAt: null,
            status: { $ne: 'cancelled' },
            createdAt: { $gte: range.start, $lte: range.end },
          },
        },
        { $unwind: '$items' },
        {
          $match: {
            'items.addedFrom': { $in: UPSELL_SOURCES },
          },
        },
        {
          $group: {
            _id: {
              name: '$items.name',
              source: '$items.addedFrom',
            },
            adds: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.subtotal' },
          },
        },
        { $sort: { adds: -1 } },
      ]),
      Order.aggregate([
        {
          $match: {
            tenantId,
            deletedAt: null,
            status: { $ne: 'cancelled' },
            createdAt: { $gte: range.start, $lte: range.end },
            'payment.status': 'approved',
          },
        },
        { $unwind: '$items' },
        {
          $match: {
            'items.addedFrom': { $in: UPSELL_SOURCES },
          },
        },
        {
          $group: {
            _id: {
              name: '$items.name',
              source: '$items.addedFrom',
            },
            conversions: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.subtotal' },
          },
        },
        { $sort: { conversions: -1 } },
      ]),
    ])

    // Merge: adds + conversions por (nombre, source)
    type Row = {
      name: string
      source: string
      adds: number
      conversions: number
      conversionRate: number
      revenue: number
    }

    const map = new Map<string, Row>()

    for (const a of addsData) {
      const key = `${a._id.name}::${a._id.source}`
      map.set(key, {
        name: a._id.name as string,
        source: a._id.source as string,
        adds: a.adds as number,
        conversions: 0,
        conversionRate: 0,
        revenue: 0,
      })
    }

    for (const c of conversionsData) {
      const key = `${c._id.name}::${c._id.source}`
      const existing = map.get(key)
      if (existing) {
        existing.conversions = c.conversions as number
        existing.revenue = c.revenue as number
        existing.conversionRate =
          existing.adds > 0
            ? Math.round((existing.conversions / existing.adds) * 100)
            : 0
      } else {
        // conversión sin add registrado (edge case)
        map.set(key, {
          name: c._id.name as string,
          source: c._id.source as string,
          adds: 0,
          conversions: c.conversions as number,
          conversionRate: 100,
          revenue: c.revenue as number,
        })
      }
    }

    const rows = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)

    // Totales globales
    const totalAdds = rows.reduce((s, r) => s + r.adds, 0)
    const totalConversions = rows.reduce((s, r) => s + r.conversions, 0)
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
    const overallConversionRate =
      totalAdds > 0 ? Math.round((totalConversions / totalAdds) * 100) : 0

    return NextResponse.json({
      period: {
        from: range.from,
        to: range.to,
        label: buildPeriodLabel(range.from, range.to),
      },
      totalAdds,
      totalConversions,
      totalRevenue,
      overallConversionRate,
      rows,
    })
  } catch {
    return NextResponse.json({ error: 'Error al obtener analytics de upselling' }, { status: 500 })
  }
}
