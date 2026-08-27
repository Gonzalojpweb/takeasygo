import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()
    const { enabled, discountPercent } = body

    const updated = await Tenant.findByIdAndUpdate(
      tenant._id,
      {
        $set: {
          'cash.enabled': !!enabled,
          'cash.discountPercent': Math.min(100, Math.max(0, Number(discountPercent) || 0)),
        },
      },
      { returnDocument: 'after' }
    )

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.cash.updated',
      entity: 'tenant',
      details: { enabled: !!enabled, discountPercent: Number(discountPercent) || 0 },
      request,
    })

    return NextResponse.json({ cash: updated?.cash })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
