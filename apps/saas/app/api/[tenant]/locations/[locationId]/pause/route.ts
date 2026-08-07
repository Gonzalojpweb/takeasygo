import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
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

  const authError = await requireAuth(request, tenant._id.toString())
  if (authError) return authError

  const location = await Location.findOne({
    _id: locationId,
    tenantId: tenant._id,
  })

  if (!location) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))

  location.status = 'paused'
  location.pausedAt = new Date()
  location.pausedReason = body.reason || null
  await location.save()

  return NextResponse.json({ ok: true, status: 'paused', pausedAt: location.pausedAt })
}
