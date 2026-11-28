import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import { requireTenantRole, FLOOR_ROLES, MANAGE_ROLES } from '@/lib/apiAuth'
import { guardRequestLocation } from '@/lib/location-scope'
import { logAudit } from '@/lib/audit'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { clampMinutes, connectivityState } from '@/lib/connectivity'

// ============================================================================
// GET   /api/[tenant]/connectivity?locationId= — estado y configuración de la
//       pausa automática sin conexión de la sede
// PATCH /api/[tenant]/connectivity — { locationId, autoPause?, minutes? }
//       (admin y encargado)
// ============================================================================

async function tenantOf(slug: string) {
  return Tenant.findOne({ slug }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>()
}

function view(location: any) {
  const s = connectivityState(location)
  return { locationId: String(location._id), autoPause: s.autoPause, minutes: s.minutes, lastSeenAt: s.lastSeenAt, online: s.online, paused: s.paused, source: location.connectivity?.lastSeenSource ?? null }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  await connectDB()
  const { tenant: slug } = await params
  const tenant = await tenantOf(slug)
  if (!tenant) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const authError = await requireTenantRole(request, String(tenant._id), FLOOR_ROLES)
  if (authError) return authError
  const locationId = request.nextUrl.searchParams.get('locationId')
  if (!locationId || !mongoose.isValidObjectId(locationId)) return NextResponse.json({ error: 'Sede inválida' }, { status: 400 })
  const sedeError = await guardRequestLocation(request, locationId, 'Sede no encontrada')
  if (sedeError) return sedeError
  const location = await Location.findOne({ _id: locationId, tenantId: tenant._id }).select('connectivity pos').lean()
  if (!location) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })
  return NextResponse.json(view(location))
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  await connectDB()
  const { tenant: slug } = await params
  const tenant = await tenantOf(slug)
  if (!tenant) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const authError = await requireTenantRole(request, String(tenant._id), MANAGE_ROLES)
  if (authError) return authError
  const body = await request.json().catch(() => ({})) as { locationId?: unknown; autoPause?: unknown; minutes?: unknown }
  const locationId = typeof body.locationId === 'string' ? body.locationId : ''
  if (!mongoose.isValidObjectId(locationId)) return NextResponse.json({ error: 'Sede inválida' }, { status: 400 })
  const sedeError = await guardRequestLocation(request, locationId, 'Sede no encontrada')
  if (sedeError) return sedeError

  const set: Record<string, unknown> = {}
  if (typeof body.autoPause === 'boolean') set['connectivity.autoPause'] = body.autoPause
  if (body.minutes !== undefined) set['connectivity.minutes'] = clampMinutes(body.minutes)
  if (Object.keys(set).length === 0) return NextResponse.json({ error: 'Nada para cambiar' }, { status: 400 })
  // Al activarla, el panel que la activa cuenta como señal: no se pausa en el acto.
  if (body.autoPause === true) { set['connectivity.lastSeenAt'] = new Date(); set['connectivity.lastSeenSource'] = 'panel' }

  const location = await Location.findOneAndUpdate({ _id: locationId, tenantId: tenant._id }, { $set: set }, { new: true }).select('connectivity pos').lean()
  if (!location) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })
  await logAudit({ tenantId: String(tenant._id), action: 'location.connectivity.update', entity: 'Location', entityId: locationId, details: { autoPause: body.autoPause, minutes: set['connectivity.minutes'] } }).catch(() => undefined)
  return NextResponse.json(view(location))
}
