import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { getSessionUser, requireTenantRole } from '@/lib/apiAuth'

// ============================================================================
// Acceso del panel a «Descuentos POS» (14/11/2026)
// ============================================================================
//   · ver (reporte y política): admin y encargado (como Cajas POS).
//   · editar la política: solo admin (dinero y controles del comercio).
// El encargado con sedes asignadas solo ve el reporte de sus sedes. El POS
// tiene que estar habilitado para el comercio.
// ============================================================================

export const DISCOUNT_VIEW_ROLES = ['admin', 'manager'] as const
export const DISCOUNT_EDIT_ROLES = ['admin'] as const

export interface DiscountAdminContext {
  tenantId: string
  userId: string
  role: string
  /** Sedes del usuario; null = todas. */
  scopeLocationIds: string[] | null
}

export async function discountAdminContext(
  request: NextRequest,
  tenantSlug: string,
  roles: readonly string[]
): Promise<DiscountAdminContext | NextResponse> {
  if (!/^[a-z0-9-]{2,50}$/.test(tenantSlug)) return NextResponse.json({ error: 'Comercio inválido' }, { status: 400 })
  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('_id features.posEnabled')
    .lean<{ _id: mongoose.Types.ObjectId; features?: { posEnabled?: boolean } }>()
  if (!tenant) return NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 })
  const tenantId = String(tenant._id)
  const denied = await requireTenantRole(request, tenantId, roles)
  if (denied) return denied
  if (!tenant.features?.posEnabled) return NextResponse.json({ error: 'El POS no está habilitado para este comercio' }, { status: 403 })
  const user = await getSessionUser(request)
  if (!user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const assigned = user.role === 'superadmin' ? [] : (user.assignedLocations ?? []).map(String)
  return { tenantId, userId: String(user.id), role: String(user.role), scopeLocationIds: assigned.length ? assigned : null }
}
