import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { fetchDashboardMetrics } from '@/lib/tia/metrics'
import { runSilAnalysis } from '@/lib/tia/sil/engine'
import TiaInsight from '@/models/TiaInsight'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const Tenant = (await import('@/models/Tenant')).default
    const tenants = await Tenant.find({
      isActive: true,
      plan: { $in: ['buy', 'full'] },
    }).select('_id plan name slug').lean() as any[]

    const globalStart = Date.now()
    console.log(`[DailyInsight] START — ${tenants.length} tenants to process`)

    const results: {
      tenantSlug: string
      tenantName: string
      plan: string
      insightsGenerated: number
      errors?: string
    }[] = []

    for (const tenant of tenants) {
      const tenantStart = Date.now()
      try {
        const metrics = await fetchDashboardMetrics(tenant._id.toString())
        const result = await runSilAnalysis(tenant._id.toString(), metrics)

        const allInsights = [...result.insights, ...result.anomalies]
        if (allInsights.length === 0) {
          results.push({
            tenantSlug: tenant.slug,
            tenantName: tenant.name,
            plan: tenant.plan,
            insightsGenerated: 0,
          })
          continue
        }

        // Plan gating: Growth gets 3 regular insights max
        const isPremium = tenant.plan === 'full'
        let toPersist = allInsights
        if (!isPremium) {
          const regular = allInsights.filter(i => i.type !== 'anomaly').slice(0, 3)
          const anomalies = allInsights.filter(i => i.type === 'anomaly')
          toPersist = [...regular, ...anomalies]
        }

        const docs = toPersist.map(i => ({
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
          source: 'daily-cron' as const,
        }))

        await TiaInsight.insertMany(docs)

        // Purge old insights (>30 days) for this tenant
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        await TiaInsight.deleteMany({
          tenantId: tenant._id,
          generatedAt: { $lt: thirtyDaysAgo },
        })

        const elapsed = Date.now() - globalStart
        const tenantElapsed = Date.now() - tenantStart
        console.log(
          `[DailyInsight] OK tenant=${tenant.slug} plan=${tenant.plan} ` +
          `insights=${docs.length} ` +
          `tenant=${tenantElapsed}ms cumulative=${elapsed}ms`
        )
        results.push({
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          plan: tenant.plan,
          insightsGenerated: docs.length,
        })
      } catch (err) {
        const elapsed = Date.now() - globalStart
        const tenantElapsed = Date.now() - tenantStart
        console.error(
          `[DailyInsight] ERROR tenant=${tenant.slug} ` +
          `tenant=${tenantElapsed}ms cumulative=${elapsed}ms`,
          err
        )
        results.push({
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          plan: tenant.plan,
          insightsGenerated: 0,
          errors: String(err),
        })
      }
    }

    const ok = results.filter(r => !r.errors).length
    const failed = results.filter(r => r.errors).length
    console.log(
      `[DailyInsight] END — ${tenants.length} tenants, ${ok} ok, ${failed} errors, ` +
      `total=${Date.now() - globalStart}ms`
    )

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      processedTenants: tenants.length,
      results,
    })
  } catch (error) {
    console.error('[DailyInsight Cron]', error)
    return NextResponse.json(
      { error: 'Error executing daily insight cron', details: String(error) },
      { status: 500 }
    )
  }
}
