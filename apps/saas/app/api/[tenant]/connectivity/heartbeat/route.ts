import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import { requireTenantRole, getSessionUser, FLOOR_ROLES } from '@/lib/apiAuth'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { recordHeartbeat } from '@/lib/connectivity'

// ============================================================================
// POST /api/[tenant]/connectivity/heartbeat — el panel de pedidos abierto
//      avisa que el local está conectado (28/11/2026)
// ============================================================================
// { locationId? } — sin sede (vista «todas»): las sedes del usuario (o todas
// las del comercio si no tiene sedes asignadas).
// ============================================================================

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  await connectDB()
  const { tenant: slug } = await params
  const tenant = await Tenant.findOne({ slug }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>()
  if (!tenant) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const tenantId = String(tenant._id)
  const authError = await requireTenantRole(request, tenantId, FLOOR_ROLES)
  if (authError) return authError

  const body = await request.json().catch(() => ({})) as { locationId?: unknown }
  const user = await getSessionUser(request)
  // Soporte (superadmin) mirando el panel no cuenta como «local conectado».
  if (user?.role === 'superadmin') return new NextResponse(null, { status: 204 })
  const assigned = (user?.assignedLocations ?? []).map(String)
  let ids: string[]
  if (typeof body.locationId === 'string' && body.locationId) {
    if (assigned.length > 0 && !assigned.includes(body.locationId)) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })
    ids = [body.locationId]
  } else if (assigned.length > 0) {
    ids = assigned
  } else {
    ids = (await Location.find({ tenantId: tenant._id, isActive: true }).select('_id').lean()).map((l) => String(l._id))
  }
  await recordHeartbeat(tenantId, ids, 'panel')
  return new NextResponse(null, { status: 204 })
}
