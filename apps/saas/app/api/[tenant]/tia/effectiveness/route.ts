import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import TiaInsight from '@/models/TiaInsight'

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  await connectDB()

  const Tenant = (await import('@/models/Tenant')).default
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id').lean() as any
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const insights = await TiaInsight.find({
      tenantId: tenant._id,
      generatedAt: { $gte: todayStart },
    }).select('status readAt dismissedAt resolvedAt').lean()

    const totalInsights = insights.length
    const readCount = insights.filter(i => i.readAt).length
    const dismissedCount = insights.filter(i => i.status === 'dismissed').length
    const resolvedCount = insights.filter(i => i.status === 'resolved').length

    return NextResponse.json({
      totalInsights,
      readCount,
      dismissedCount,
      resolvedCount,
      readRate: totalInsights > 0 ? readCount / totalInsights : 0,
      dismissRate: totalInsights > 0 ? dismissedCount / totalInsights : 0,
      resolveRate: totalInsights > 0 ? resolvedCount / totalInsights : 0,
    }, {
      headers: { 'Cache-Control': 'no-cache' },
    })
  } catch (error) {
    console.error('[TIA Effectiveness]', error)
    return NextResponse.json({ error: 'Error fetching effectiveness' }, { status: 500 })
  }
}
