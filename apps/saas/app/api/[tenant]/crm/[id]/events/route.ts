import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import CustomerProfile from '@/models/CustomerProfile'
import { canAccess } from '@/lib/plans'
import { requireAuth } from '@/lib/apiAuth'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/[tenant]/crm/[id]/events — Eventos crudos del cliente (P7)
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; id: string }> }
) {
  try {
    const { tenant: tenantSlug, id } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
    if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!canAccess(tenant.plan, 'crm')) {
      return NextResponse.json({ error: 'CRM no disponible en tu plan actual.' }, { status: 403 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const profile = await CustomerProfile.findOne({ _id: id, tenantId: tenant._id }).lean()
    if (!profile) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

    const url = new URL(request.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
    const limit = Math.min(100, parseInt(url.searchParams.get('limit') || '50'))

    const CustomerEvent = (await import('@/models/CustomerEvent')).default

    const [events, total] = await Promise.all([
      CustomerEvent.find({ phoneHash: profile.phoneHash, tenantId: tenant._id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      CustomerEvent.countDocuments({ phoneHash: profile.phoneHash, tenantId: tenant._id }),
    ])

    return NextResponse.json({
      events,
      total,
      page,
      pages: Math.ceil(total / limit),
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
