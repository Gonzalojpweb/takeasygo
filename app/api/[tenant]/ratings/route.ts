import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Rating from '@/models/Rating'
import { requireAuth } from '@/lib/apiAuth'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params

    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const [aggResult, recent] = await Promise.all([
      Rating.aggregate([
        { $match: { tenantId: tenant._id } },
        {
          $group: {
            _id: null,
            avg: { $avg: '$stars' },
            count: { $sum: 1 },
            dist: {
              $push: '$stars',
            },
          },
        },
      ]),
      Rating.find({ tenantId: tenant._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('orderId', 'orderNumber')
        .lean(),
    ])

    const agg = aggResult[0]
    const dist = [1, 2, 3, 4, 5].map(s => ({
      stars: s,
      count: agg ? agg.dist.filter((x: number) => x === s).length : 0,
    }))

    return NextResponse.json({
      avg: agg ? Math.round(agg.avg * 10) / 10 : null,
      count: agg?.count ?? 0,
      distribution: dist,
      recent: recent.map((r: any) => ({
        id: r._id.toString(),
        stars: r.stars,
        comment: r.comment,
        orderNumber: (r.orderId as any)?.orderNumber ?? '—',
        createdAt: r.createdAt,
      })),
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
