import { NextRequest, NextResponse } from 'next/server'
import { requireTenantRole, MANAGE_ROLES } from '@/lib/apiAuth'
import { guardRequestLocation } from '@/lib/location-scope'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locationId: string }> }
) {
  await connectDB()
  const { tenant: tenantSlug, locationId } = await params
  const tenant = await Tenant.findOne({ slug: tenantSlug }).lean<{ _id: any }>()
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
  if (authError) return authError
  const sedeError = await guardRequestLocation(request, locationId, 'Sede no encontrada')
  if (sedeError) return sedeError

  const location = await Location.findOne({
    _id: locationId,
    tenantId: tenant._id,
  })

  if (!location) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }

  location.status = 'active'
  location.pausedAt = null
  location.pausedReason = null
  await location.save()

  return NextResponse.json({ ok: true, status: 'active' })
}
