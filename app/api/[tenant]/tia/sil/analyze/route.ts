import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { fetchDashboardMetrics } from '@/lib/tia/metrics'
import { runSilAnalysis } from '@/lib/tia/sil/engine'
import TiaInsight from '@/models/TiaInsight'

export async function POST(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params

  await connectDB()

  const Tenant = (await import('@/models/Tenant')).default
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id plan').lean() as any
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  const isPremium = tenant.plan === 'full'

  try {
    const metrics = await fetchDashboardMetrics(tenant._id.toString())
    const result = await runSilAnalysis(tenant._id.toString(), metrics)

    // Persist insights to MongoDB for history (Stage 4 will use cron)
    if (result.insights.length > 0 || result.anomalies.length > 0) {
      const docs = [...result.insights, ...result.anomalies].map(i => ({
        tenantId: tenant._id,
        type: i.type,
        severity: i.severity,
        category: i.category,
        title: i.title,
        description: i.description,
        metric: i.metric,
        currentValue: i.currentValue,
        previousValue: i.previousValue,
        changePercent: i.changePercent,
        sampleSize: i.sampleSize,
        recommendation: i.recommendation,
        status: 'active' as const,
        generatedAt: new Date(),
        source: 'sil' as const,
      }))

      await TiaInsight.insertMany(docs)
    }

    return NextResponse.json({
      ...result,
      plan: tenant.plan,
      tier: isPremium ? 'full' : 'growth',
    })
  } catch (error) {
    console.error('[SIL Analyze]', error)
    return NextResponse.json({ error: 'Error running SIL analysis' }, { status: 500 })
  }
}
