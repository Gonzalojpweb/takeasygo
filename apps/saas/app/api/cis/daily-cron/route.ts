import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { processTenant } from '@/lib/cis/cron'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cis/daily-cron — Pipeline nocturno de CIS
// ─────────────────────────────────────────────────────────────────────────────
// Patrón: Replica la estructura de /api/tia/daily-insight
// - Bearer token auth via CRON_SECRET
// - Per-tenant error isolation
// - Plan gating (solo tenants con plan buy/full)
// - Structured logging con prefijo [CisCron]
// ─────────────────────────────────────────────────────────────────────────────

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
    console.log(`[CisCron] START — ${tenants.length} tenants to process`)

    const results: {
      tenantSlug: string
      tenantName: string
      plan: string
      profilesProcessed: number
      segmentsChanged: number
      signalsDetected: number
      errors?: string
    }[] = []

    for (const tenant of tenants) {
      const tenantStart = Date.now()
      try {
        const result = await processTenant(tenant._id)

        console.log(
          `[CisCron] OK tenant=${tenant.slug} plan=${tenant.plan} ` +
          `profiles=${result.profilesProcessed} segments_changed=${result.segmentsChanged} ` +
          `signals=${result.signalsDetected} health_scores=${result.healthScoresCalculated} ` +
          `events=${result.eventsCreated} ` +
          `processTenant=${result.executionTimeMs}ms cumulative=${Date.now() - globalStart}ms`
        )

        results.push({
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          plan: tenant.plan,
          profilesProcessed: result.profilesProcessed,
          segmentsChanged: result.segmentsChanged,
          signalsDetected: result.signalsDetected,
        })
      } catch (err) {
        const tenantElapsed = Date.now() - tenantStart
        console.error(
          `[CisCron] ERROR tenant=${tenant.slug} ` +
          `tenant=${tenantElapsed}ms cumulative=${Date.now() - globalStart}ms`,
          err
        )
        results.push({
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          plan: tenant.plan,
          profilesProcessed: 0,
          segmentsChanged: 0,
          signalsDetected: 0,
          errors: String(err),
        })
      }
    }

    const ok = results.filter(r => !r.errors).length
    const failed = results.filter(r => r.errors).length
    console.log(
      `[CisCron] END — ${tenants.length} tenants, ${ok} ok, ${failed} errors, ` +
      `total=${Date.now() - globalStart}ms`
    )

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      processedTenants: tenants.length,
      results,
    })
  } catch (error) {
    console.error('[CisCron Cron]', error)
    return NextResponse.json(
      { error: 'Error executing CIS daily cron', details: String(error) },
      { status: 500 }
    )
  }
}
