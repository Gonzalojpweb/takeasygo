import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

export async function PATCH(
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

    const { whatsappPhone, notifyOnOrder, notifyOnReservation } = await request.json()

    const updated = await Tenant.findByIdAndUpdate(
      tenant._id,
      {
        $set: {
          'notifications.whatsappPhone': whatsappPhone || null,
          'notifications.notifyOnOrder': notifyOnOrder ?? true,
          'notifications.notifyOnReservation': notifyOnReservation ?? true,
        },
      },
      { returnDocument: 'after' }
    )

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.notifications.updated',
      entity: 'tenant',
      details: { whatsappPhone: whatsappPhone || null, notifyOnOrder, notifyOnReservation },
      request,
    })
    return NextResponse.json({ notifications: updated?.notifications })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
