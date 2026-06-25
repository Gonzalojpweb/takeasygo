import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import { canAccess } from '@/lib/plans'
import { resegmentateAll } from '@/lib/cis/segmentation'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/[tenant]/crm/segment — Re-segmentar todos los clientes
// ─────────────────────────────────────────────────────────────────────────────
// Endpoint administrativo para forzar re-segmentación de todos los clientes.
// Útil después de cambios en las reglas de segmentación o para debugging.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(
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

    const result = await resegmentateAll(tenant._id)

    return NextResponse.json({
      success: true,
      total: result.total,
      changed: result.changed,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
