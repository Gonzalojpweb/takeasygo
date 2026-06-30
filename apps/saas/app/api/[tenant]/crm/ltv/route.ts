import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import CustomerProfile from '@/models/CustomerProfile'
import { canAccess } from '@/lib/plans'
import { safeDecrypt } from '@/lib/crypto'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/[tenant]/crm/ltv — Dashboard consolidado de LTV por segmento
// ─────────────────────────────────────────────────────────────────────────────
// Devuelve: distribución de LTV por segmento, top customers, histograma.
// Lenguaje humano: labels descriptivos para dueños de restaurantes.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
    if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!canAccess(tenant.plan, 'crm')) {
      return NextResponse.json({ error: 'CRM no disponible en tu plan actual.' }, { status: 403 })
    }

    const tid = tenant._id

    // 1. LTV promedio por segmento
    const ltvBySegment = await CustomerProfile.aggregate([
      { $match: { tenantId: tid, totalSpent: { $gt: 0 } } },
      {
        $group: {
          _id: '$segment',
          avgLTV: { $avg: '$totalSpent' },
          avgTicket: { $avg: '$avgTicket' },
          avgVisitFrequency: { $avg: '$visitFrequency' },
          count: { $sum: 1 },
        },
      },
      { $sort: { avgLTV: -1 } },
    ])

    // 2. Top 15 clientes por LTV
    const topCustomers = await CustomerProfile.find({ tenantId: tid, totalSpent: { $gt: 0 } })
      .select({ phoneHash: 1, consumerId: 1, segment: 1, totalSpent: 1, avgTicket: 1, orderCount: 1, healthScore: 1, visitFrequency: 1 })
      .sort({ totalSpent: -1 })
      .limit(15)
      .lean()

    // Obtener nombres de los top customers
    const Consumer = (await import('@/models/Consumer')).default
    const consumerIds = topCustomers.map((c: any) => c.consumerId).filter(Boolean)
    const consumers = await Consumer.find({ _id: { $in: consumerIds } })
      .select({ _id: 1, name: 1, phone: 1 })
      .lean()

    const consumerMap = new Map<string, any>(
      consumers.map((c: any) => [c._id.toString(), c])
    )

    const enrichedTopCustomers = topCustomers.map((c: any) => {
      const consumer = consumerMap.get(c.consumerId?.toString() ?? '')
      return {
        name: consumer?.name ? safeDecrypt(consumer.name) : 'Sin nombre',
        phone: consumer?.phone ? safeDecrypt(consumer.phone) : '',
        segment: c.segment,
        totalSpent: c.totalSpent,
        avgTicket: c.avgTicket,
        orderCount: c.orderCount,
        healthScore: c.healthScore?.total ?? 0,
        visitFrequency: c.visitFrequency,
      }
    })

    // 3. Histograma de LTV (rangos)
    const totalCustomersWithLTV = await CustomerProfile.countDocuments({ tenantId: tid, totalSpent: { $gt: 0 } })

    const histogramRanges = [
      { min: 0, max: 5000, label: '$0 - $5.000' },
      { min: 5000, max: 15000, label: '$5.000 - $15.000' },
      { min: 15000, max: 30000, label: '$15.000 - $30.000' },
      { min: 30000, max: 60000, label: '$30.000 - $60.000' },
      { min: 60000, max: 100000, label: '$60.000 - $100.000' },
      { min: 100000, max: Infinity, label: '$100.000+' },
    ]

    const histogram = await Promise.all(
      histogramRanges.map(async (range) => {
        const filter: Record<string, any> = { tenantId: tid, totalSpent: { $gte: range.min } }
        if (range.max !== Infinity) filter.totalSpent.$lt = range.max
        const count = await CustomerProfile.countDocuments(filter)
        return { label: range.label, count }
      })
    )

    // 4. Métricas agregadas
    const aggregated = await CustomerProfile.aggregate([
      { $match: { tenantId: tid, totalSpent: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          totalLTV: { $sum: '$totalSpent' },
          avgLTV: { $avg: '$totalSpent' },
          medianLTV: { $push: '$totalSpent' },
          maxLTV: { $max: '$totalSpent' },
          minLTV: { $min: '$totalSpent' },
          totalCustomers: { $sum: 1 },
        },
      },
    ])

    const agg = aggregated[0] || { totalLTV: 0, avgLTV: 0, medianLTV: [], maxLTV: 0, minLTV: 0, totalCustomers: 0 }

    // Calcular mediana
    const sorted = [...agg.medianLTV].sort((a: number, b: number) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const medianLTV = sorted.length > 0 ? (sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) : 0

    return NextResponse.json({
      ltvBySegment: ltvBySegment.map((s: any) => ({
        segment: s._id,
        avgLTV: Math.round(s.avgLTV),
        avgTicket: Math.round(s.avgTicket),
        avgVisitFrequency: Math.round(s.avgVisitFrequency * 10) / 10,
        count: s.count,
      })),
      topCustomers: enrichedTopCustomers,
      histogram,
      aggregated: {
        totalLTV: Math.round(agg.totalLTV),
        avgLTV: Math.round(agg.avgLTV),
        medianLTV: Math.round(medianLTV),
        maxLTV: Math.round(agg.maxLTV),
        minLTV: Math.round(agg.minLTV),
        totalCustomers: agg.totalCustomers,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
