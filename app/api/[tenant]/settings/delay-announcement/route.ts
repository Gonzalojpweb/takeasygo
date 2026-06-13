import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'
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

    const roleError = await requireAdminRole(request, tenant._id.toString())
    if (roleError) return roleError

    const { locationId, enabled, extraMinutes, message } = await request.json()

    if (!locationId) {
      return NextResponse.json({ error: 'locationId es obligatorio' }, { status: 400 })
    }

    const location = await Location.findOne({ _id: locationId, tenantId: tenant._id })
    if (!location) {
      return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })
    }

    const update: Record<string, any> = {
      'settings.delayAnnouncement.enabled': !!enabled,
      'settings.delayAnnouncement.updatedAt': new Date(),
    }

    if (typeof extraMinutes === 'number' && extraMinutes >= 0) {
      update['settings.delayAnnouncement.extraMinutes'] = extraMinutes
    }
    if (typeof message === 'string') {
      update['settings.delayAnnouncement.message'] = message
    }

    const updated = await Location.findByIdAndUpdate(
      locationId,
      { $set: update },
      { returnDocument: 'after', runValidators: true }
    )

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.delay_announcement.updated',
      entity: 'location',
      entityId: locationId,
      details: { enabled, extraMinutes, message },
      request,
    })

    return NextResponse.json({
      delayAnnouncement: updated?.settings?.delayAnnouncement ?? null,
    })
  } catch (error) {
    console.error('[DelayAnnouncement API] PATCH error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
