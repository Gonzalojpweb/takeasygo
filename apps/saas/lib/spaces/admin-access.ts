import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { MANAGE_ROLES, getSessionUser, requireTenantRole } from '@/lib/apiAuth'
import { SpaceError } from './location-spaces'

// ============================================================================
// Acceso del panel a «Salón y espacios» (14/11/2026)
// ============================================================================
// Administrador y encargado (MANAGE_ROLES). Un encargado con sedes asignadas
// solo edita las suyas. Requiere POS o reservas activos en el comercio.
// ============================================================================

export interface SpacesAdminContext {
  tenantId: string
  userId: string
  role: string
}

export async function spacesAdminContext(request: NextRequest, tenantSlug: string, locationId: string): Promise<SpacesAdminContext | NextResponse> {
  if (!/^[a-z0-9-]{2,50}$/.test(tenantSlug)) return NextResponse.json({ error: 'Comercio inválido' }, { status: 400 })
  if (!mongoose.isValidObjectId(locationId)) return NextResponse.json({ error: 'Sede inválida' }, { status: 400 })
  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('_id features.posEnabled features.reservations')
    .lean<{ _id: mongoose.Types.ObjectId; features?: { posEnabled?: boolean; reservations?: boolean } }>()
  if (!tenant) return NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 })
  const tenantId = String(tenant._id)
  const denied = await requireTenantRole(request, tenantId, MANAGE_ROLES)
  if (denied) return denied
  if (!tenant.features?.posEnabled && !tenant.features?.reservations) {
    return NextResponse.json({ error: 'Los espacios se usan con el POS o con reservas, y ninguno está activo' }, { status: 403 })
  }
  const user = await getSessionUser(request)
  if (!user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const assigned = user.role === 'superadmin' ? [] : (user.assignedLocations ?? []).map(String)
  if (assigned.length > 0 && !assigned.includes(locationId)) {
    return NextResponse.json({ error: 'No tenés acceso a esta sede' }, { status: 403 })
  }
  return { tenantId, userId: String(user.id), role: String(user.role) }
}

export function spaceErrorResponse(err: unknown): NextResponse {
  if (err instanceof SpaceError) return NextResponse.json({ error: err.message }, { status: err.status })
  throw err
}
