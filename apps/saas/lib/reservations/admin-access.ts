import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { getSessionUser, requireTenantRole } from '@/lib/apiAuth'
import { canAccess, type Plan } from '@/lib/plans'

// ============================================================================
// Acceso a reportes y contactos de reservas (panel, 14/11/2026)
// ============================================================================
// Ver: administrador y encargado (como Reservaciones). Exportar contactos:
// solo administrador. Plan con reservas y módulo activo. Encargado con sedes
// asignadas: solo sus sedes (scopeLocationIds).
// ============================================================================

export interface ReservationsAdminContext {
  tenantId: string
  tenantSlug: string
  tenantName: string
  userId: string
  role: string
  scopeLocationIds: string[] | null
}

export async function reservationsAdminContext(request: NextRequest, tenantSlug: string, roles: readonly string[]): Promise<ReservationsAdminContext | NextResponse> {
  if (!/^[a-z0-9-]{2,50}$/.test(tenantSlug)) return NextResponse.json({ error: 'Comercio inválido' }, { status: 400 })
  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('_id name plan features.reservations')
    .lean<{ _id: mongoose.Types.ObjectId; name: string; plan?: Plan; features?: { reservations?: boolean } }>()
  if (!tenant) return NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 })
  const tenantId = String(tenant._id)
  const denied = await requireTenantRole(request, tenantId, roles)
  if (denied) return denied
  if (!tenant.features?.reservations || !canAccess(tenant.plan ?? 'try', 'reservations')) {
    return NextResponse.json({ error: 'Reservaciones no habilitadas' }, { status: 403 })
  }
  const user = await getSessionUser(request)
  if (!user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const assigned = user.role === 'superadmin' ? [] : (user.assignedLocations ?? []).map(String)
  return { tenantId, tenantSlug, tenantName: tenant.name, userId: String(user.id), role: String(user.role), scopeLocationIds: assigned.length ? assigned : null }
}
