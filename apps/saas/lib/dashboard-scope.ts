// ============================================================================
// dashboard-scope.ts — Alcance de sede para el dashboard y los reportes admin
// ============================================================================
// Un único lugar decide QUÉ sedes ve cada request de métricas:
//
//   - `?locationId=X` (selector de sede del TopBar): solo X, validado contra
//     el tenant y contra el alcance del usuario (sede ajena → 403).
//   - sin locationId + usuario con sedes asignadas: solo sus sedes.
//   - sin locationId + usuario de tenant (sin sedes asignadas): consolidado.
//
// El filtro de sede es SIEMPRE activo (sin flag): un usuario de una sede nunca
// recibe números de otra. El permiso por rol va por la matriz RBAC detrás de
// `rbac.sedeScope` (off/log/enforce), igual que el resto de las rutas:
//   - consolidado → `reports.view_consolidated` (solo fila tenant-wide)
//   - por sede    → `reports.read` en cada sede pedida
//
// Los modelos se importan dinámicamente: las rutas del dashboard ya lo hacían
// así para evitar el TDZ de imports circulares entre modelos.
// ============================================================================

import mongoose from 'mongoose'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/apiAuth'
import { enforcePermission, type Permission } from '@/lib/rbac'
import type { TenantFlags } from '@/lib/feature-flags'

type ScopedTenant<T> = T & { _id: mongoose.Types.ObjectId; flags?: TenantFlags | null }

export interface DashboardScope<T> {
  tenant: ScopedTenant<T>
  /** null = consolidado (todas las sedes del tenant). */
  locationIds: mongoose.Types.ObjectId[] | null
  consolidated: boolean
  /** Fragmento para mezclar en cualquier $match/find sobre colecciones con `locationId`. */
  match: { locationId?: { $in: mongoose.Types.ObjectId[] } }
}

export type DashboardScopeResult<T> =
  | { ok: true; scope: DashboardScope<T> }
  | { ok: false; response: NextResponse }

function deny(status: number, error: string): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error }, { status }) }
}

export async function resolveDashboardScope<T extends object = object>(
  request: NextRequest,
  tenantSlug: string,
  options: {
    /** Campos extra del tenant (siempre se agregan `_id flags`). */
    select?: string
    /** Permiso para la vista por sede. Default `reports.read`. */
    permission?: Permission
    /** Métricas que solo existen a nivel tenant (ICO, comisiones): exige consolidado. */
    tenantOnly?: boolean
  } = {}
): Promise<DashboardScopeResult<T>> {
  const user = await getSessionUser(request)
  if (!user?.role) return deny(403, 'Acceso denegado')

  const { connectDB } = await import('@/lib/mongoose')
  await connectDB()
  const Tenant = (await import('@/models/Tenant')).default
  const Location = (await import('@/models/Location')).default

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select(`_id flags ${options.select ?? ''}`.trim())
    .lean<ScopedTenant<T>>()
  if (!tenant) return deny(404, 'Tenant no encontrado')

  const isSuperadmin = user.role === 'superadmin'
  if (!isSuperadmin && user.tenantId?.toString() !== tenant._id.toString()) {
    return deny(403, 'Acceso denegado')
  }

  const assigned = isSuperadmin ? [] : (user.assignedLocations ?? []).map(String)
  const requested = request.nextUrl.searchParams.get('locationId')

  let ids: string[] | null
  if (requested) {
    if (!mongoose.Types.ObjectId.isValid(requested)) return deny(400, 'locationId inválido')
    if (assigned.length > 0 && !assigned.includes(requested)) {
      return deny(403, 'Acceso denegado a esta sede')
    }
    const exists = await Location.exists({ _id: requested, tenantId: tenant._id })
    if (!exists) return deny(404, 'Sede no encontrada')
    ids = [requested]
  } else if (assigned.length > 0) {
    ids = assigned
  } else {
    ids = null
  }

  const consolidated = ids === null
  if (options.tenantOnly && !consolidated) {
    return deny(403, 'Esta métrica es del negocio completo')
  }

  const tenantId = tenant._id.toString()
  const route = request.nextUrl.pathname
  if (consolidated) {
    const permError = await enforcePermission({
      user, tenant, tenantId, permission: 'reports.view_consolidated', route,
    })
    if (permError) return { ok: false, response: permError }
  } else {
    for (const locationId of ids!) {
      const permError = await enforcePermission({
        user, tenant, tenantId, locationId, permission: options.permission ?? 'reports.read', route,
      })
      if (permError) return { ok: false, response: permError }
    }
  }

  const locationIds = ids ? ids.map(id => new mongoose.Types.ObjectId(id)) : null
  return {
    ok: true,
    scope: {
      tenant,
      locationIds,
      consolidated,
      match: locationIds ? { locationId: { $in: locationIds } } : {},
    },
  }
}
