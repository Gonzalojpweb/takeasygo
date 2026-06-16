import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import TiaInsight from '@/models/TiaInsight'

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params

  await connectDB()

  const Tenant = (await import('@/models/Tenant')).default
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id plan').lean() as any
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const isPremium = tenant.plan === 'full'
  const status = req.nextUrl.searchParams.get('status') ?? 'active'

  try {
    const query: any = {
      tenantId: tenant._id,
      status,
      generatedAt: { $gte: todayStart },
    }

    const type = req.nextUrl.searchParams.get('type')
    if (type) query.type = type

    let insights = await TiaInsight.find(query)
      .sort({ severity: -1, generatedAt: -1 })
      .lean()

    // Growth plan: max 3 insights (excluding anomalies)
    if (!isPremium) {
      const regular = insights.filter(i => i.type !== 'anomaly').slice(0, 3)
      const anomalies = insights.filter(i => i.type === 'anomaly')
      insights = [...regular, ...anomalies]
    }

    return NextResponse.json({
      insights,
      plan: tenant.plan,
      generatedAt: insights.length > 0 ? insights[0].generatedAt : null,
      total: insights.length,
    })
  } catch (error) {
    console.error('[TIA Insights]', error)
    return NextResponse.json({ error: 'Error fetching insights' }, { status: 500 })
  }
}
