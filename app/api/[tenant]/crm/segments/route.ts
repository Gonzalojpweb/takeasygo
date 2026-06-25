import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import { canAccess } from '@/lib/plans'
import { getSegmentDistribution } from '@/lib/cis/tia-bridge'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/[tenant]/crm/segments — Distribución de segmentos
// ─────────────────────────────────────────────────────────────────────────────

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

    const distribution = await getSegmentDistribution(tenant._id)

    return NextResponse.json({ segments: distribution })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
