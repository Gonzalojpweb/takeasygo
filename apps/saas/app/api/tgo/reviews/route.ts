import { connectDB } from '@/lib/mongoose'
import Rating from '@/models/Rating'
import Feedback from '@/models/Feedback'
import Tenant from '@/models/Tenant'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await connectDB()

    // ── Aggregate stats across all tenants ──
    const [ratingAgg, feedbackAgg, totalTenants] = await Promise.all([
      Rating.aggregate([
        {
          $group: {
            _id: null,
            avg: { $avg: '$stars' },
            count: { $sum: 1 },
            dist: { $push: '$stars' },
          },
        },
      ]),
      Feedback.aggregate([
        { $match: { event: 'checkout_success', satisfaction: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            excelente: { $sum: { $cond: [{ $eq: ['$satisfaction', 'excelente'] }, 1, 0] } },
            buena: { $sum: { $cond: [{ $eq: ['$satisfaction', 'buena'] }, 1, 0] } },
            mejorable: { $sum: { $cond: [{ $eq: ['$satisfaction', 'mejorable'] }, 1, 0] } },
          },
        },
      ]),
      Tenant.countDocuments({ isActive: true }),
    ])

    const rAgg = ratingAgg[0]
    const fAgg = feedbackAgg[0]

    // ── Recent high-rated reviews (4-5 stars) with tenant slug ──
    const recentReviews = await Rating.find({ stars: { $gte: 4 }, comment: { $ne: '' } })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('tenantId', 'slug name')
      .lean()

    // ── Recent positive feedback (excelente/buena) with tenant slug ──
    const recentFeedback = await Feedback.find({
      event: 'checkout_success',
      satisfaction: { $in: ['excelente', 'buena'] },
      comment: { $exists: true, $ne: '' },
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('tenantId', 'slug name')
      .lean()

    // ── Merge and format ──
    const reviews = recentReviews
      .filter((r: any) => r.tenantId)
      .map((r: any) => ({
        type: 'rating' as const,
        stars: r.stars,
        comment: r.comment,
        tenantSlug: (r.tenantId as any).slug,
        tenantName: (r.tenantId as any).name,
        createdAt: r.createdAt,
      }))

    const feedbacks = recentFeedback
      .filter((f: any) => f.tenantId)
      .map((f: any) => ({
        type: 'feedback' as const,
        satisfaction: f.satisfaction,
        comment: f.comment,
        tenantSlug: (f.tenantId as any).slug,
        tenantName: (f.tenantId as any).name,
        createdAt: f.createdAt,
      }))

    // Interleave: rating, feedback, rating, feedback...
    const merged: (typeof reviews[0] | typeof feedbacks[0])[] = []
    let ri = 0, fi = 0
    while (ri < reviews.length || fi < feedbacks.length) {
      if (ri < reviews.length) merged.push(reviews[ri++])
      if (fi < feedbacks.length) merged.push(feedbacks[fi++])
    }

    // Take top 12 for the landing
    const feed = merged.slice(0, 12)

    return NextResponse.json({
      stats: {
        totalRatings: rAgg?.count ?? 0,
        averageStars: rAgg ? Math.round(rAgg.avg * 10) / 10 : null,
        totalFeedback: fAgg?.total ?? 0,
        satisfactionRate: fAgg ? Math.round(((fAgg.excelente + fAgg.buena) / fAgg.total) * 100) : null,
        excellentRate: fAgg ? Math.round((fAgg.excelente / fAgg.total) * 100) : null,
        totalTenants,
      },
      feed,
    })
  } catch (error) {
    console.error('[api/tgo/reviews]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
