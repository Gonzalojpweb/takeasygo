import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import TiaInsight from '@/models/TiaInsight'
import { generateRecommendations } from '@/lib/tia/recommendations'

async function getTenant(tenantSlug: string) {
  const Tenant = (await import('@/models/Tenant')).default
  return Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id plan').lean() as any
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  await connectDB()

  const tenant = await getTenant(tenantSlug)
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  try {
    const { insightId, action } = await req.json()

    if (!insightId || !['read', 'dismiss', 'resolve'].includes(action)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const insight = await TiaInsight.findOne({ _id: insightId, tenantId: tenant._id })
    if (!insight) {
      return NextResponse.json({ error: 'Insight not found' }, { status: 404 })
    }

    const now = new Date()

    switch (action) {
      case 'read':
        if (!insight.readAt) {
          await TiaInsight.findOneAndUpdate(
            { _id: insightId, tenantId: tenant._id, readAt: null },
            { $set: { readAt: now } }
          )
        }
        break
      case 'dismiss':
        await TiaInsight.findOneAndUpdate(
          { _id: insightId, tenantId: tenant._id },
          { $set: { status: 'dismissed', dismissedAt: now } }
        )
        break
      case 'resolve':
        await TiaInsight.findOneAndUpdate(
          { _id: insightId, tenantId: tenant._id },
          { $set: { status: 'resolved', resolvedAt: now } }
        )
        break
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[TIA Insights PATCH]', error)
    return NextResponse.json({ error: 'Error updating insight' }, { status: 500 })
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params

  await connectDB()

  const tenant = await getTenant(tenantSlug)
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404, headers: { 'Cache-Control': 'no-cache' } })
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

    // Generate recommendations from insights (only for Premium)
    const typedInsights = insights.map(i => ({
      type: i.type as any,
      severity: i.severity as any,
      category: i.category as any,
      title: i.title ?? '',
      description: i.description ?? '',
      metric: i.metric ?? '',
      currentValue: i.currentValue ?? 0,
      previousValue: i.previousValue,
      changePercent: i.changePercent,
      sampleSize: i.sampleSize ?? 0,
      recommendation: i.recommendation,
    }))

    const recommendations = isPremium ? generateRecommendations(typedInsights) : []

    return NextResponse.json({
      insights,
      recommendations,
      plan: tenant.plan,
      generatedAt: insights.length > 0 ? insights[0].generatedAt : null,
      total: insights.length,
    }, {
      headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=300' },
    })
  } catch (error) {
    console.error('[TIA Insights]', error)
    return NextResponse.json({ error: 'Error fetching insights' }, { status: 500, headers: { 'Cache-Control': 'no-cache' } })
  }
}
