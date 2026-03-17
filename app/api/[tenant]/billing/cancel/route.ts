import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireAdminRole } from '@/lib/apiAuth'
import { getPlatformMPClient } from '@/lib/mp-platform'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const preapprovalId = tenant.subscription?.preapprovalId
    if (!preapprovalId) {
      return NextResponse.json({ error: 'No hay suscripción activa' }, { status: 400 })
    }

    const { preApproval } = getPlatformMPClient()

    await preApproval.update({
      id: preapprovalId,
      body: { status: 'cancelled' } as any,
    })

    tenant.subscription.status = 'cancelled'
    tenant.subscription.lastUpdated = new Date()
    // Downgrade al plan try al cancelar
    tenant.plan = 'try'
    await tenant.save()

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('[billing/cancel]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
