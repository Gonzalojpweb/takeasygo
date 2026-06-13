import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

async function resolveTenant(tenantSlug: string) {
  await connectDB()
  return Tenant.findOne({ slug: tenantSlug, isActive: true })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locationId: string }> }
) {
  try {
    const { tenant: tenantSlug, locationId } = await params
    const tenant = await resolveTenant(tenantSlug)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const location = await Location.findOne({ _id: locationId, tenantId: tenant._id, isActive: true })
      .select('name scheduledOrdersConfig serviceHours settings.estimatedPickupTime settings.delayAnnouncement')
      .lean() as any
    if (!location) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })

    const delay = location.settings?.delayAnnouncement
    const baseTime = location.settings?.estimatedPickupTime ?? 20
    const effectiveTime = delay?.enabled ? baseTime + (delay.extraMinutes ?? 0) : baseTime

    return NextResponse.json({ location, effectiveEstimatedTime: effectiveTime })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locationId: string }> }
) {
  try {
    const { tenant: tenantSlug, locationId } = await params
    const tenant = await resolveTenant(tenantSlug)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()

    const location = await Location.findOneAndUpdate(
      { _id: locationId, tenantId: tenant._id },
      { $set: body },
      { returnDocument: 'after', runValidators: true }
    )

    if (!location) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })

    logAudit({ tenantId: tenant._id.toString(), action: 'settings.location.updated', entity: 'location', entityId: locationId, details: { fields: Object.keys(body) }, request })
    return NextResponse.json({ location })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locationId: string }> }
) {
  try {
    const { tenant: tenantSlug, locationId } = await params
    const tenant = await resolveTenant(tenantSlug)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    // Soft delete
    const location = await Location.findOneAndUpdate(
      { _id: locationId, tenantId: tenant._id },
      { $set: { isActive: false } },
      { new: true }
    )

    if (!location) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
