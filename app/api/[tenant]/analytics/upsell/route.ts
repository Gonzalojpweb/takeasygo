import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { requireAuth } from '@/lib/apiAuth'
import { NextRequest, NextResponse } from 'next/server'
import { canAccess } from '@/lib/plans'
import type { Plan } from '@/lib/plans'

const WINDOW_DAYS = 90

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
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000)

    const UPSELL_SOURCES = ['upsell_sheet', 'checkout_banner']

    // Agrupación 1: cuántas veces cada ítem fue agregado via upsell (en cualquier orden)
    // Agrupación 2: cuántas veces cada ítem upsell terminó en una orden pagada (approved)
    const [addsData, conversionsData] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            tenantId,
            createdAt: { $gte: since },
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
            createdAt: { $gte: since },
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
      windowDays: WINDOW_DAYS,
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
