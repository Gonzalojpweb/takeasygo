import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import { requireAuth, getSessionUser } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'

// ============================================================================
// PATCH /api/[tenant]/locations/[locationId]/print-settings  (08/11/2026)
// ============================================================================
// Preferencias de impresión de la sede. Hoy: `autoPrintAppOrders` — si los
// pedidos de la app / menú online se imprimen solos al confirmarse (true, por
// defecto) o el equipo los imprime a mano con «Reimprimir» (false).
// Endpoint propio para tocar SOLO ese campo ($set puntual): el PUT general de
// la sede reemplaza objetos enteros.
// ============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locationId: string }> }
) {
  try {
    const { tenant: tenantSlug, locationId } = await params
    if (!mongoose.isValidObjectId(locationId)) {
      return NextResponse.json({ error: 'Sede inválida' }, { status: 400 })
    }
    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id flags').lean<{ _id: mongoose.Types.ObjectId; flags?: Record<string, boolean> | null }>()
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const sessionUser = await getSessionUser(request)
    if (!sessionUser || !['admin', 'manager', 'superadmin'].includes(sessionUser.role ?? '')) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }
    if (sessionUser.role !== 'admin' && sessionUser.role !== 'superadmin') {
      const locs = sessionUser.assignedLocations ?? []
      if (locs.length > 0 && !locs.includes(locationId)) {
        return NextResponse.json({ error: 'No tenés permiso para modificar esta sede' }, { status: 403 })
      }
    }
    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      locationId,
      permission: 'settings.write',
    })
    if (permError) return permError

    const body = await request.json().catch(() => null)
    if (typeof body?.autoPrintAppOrders !== 'boolean') {
      return NextResponse.json({ error: 'autoPrintAppOrders debe ser true o false' }, { status: 400 })
    }

    const res = await Location.updateOne(
      { _id: locationId, tenantId: tenant._id, isActive: true },
      { $set: { 'settings.autoPrintAppOrders': body.autoPrintAppOrders } }
    )
    if (res.matchedCount === 0) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.location.updated',
      entity: 'location',
      entityId: locationId,
      details: { fields: ['settings.autoPrintAppOrders'], autoPrintAppOrders: body.autoPrintAppOrders },
      request,
    })
    return NextResponse.json({ ok: true, autoPrintAppOrders: body.autoPrintAppOrders })
  } catch (error) {
    console.error('[print-settings] PATCH', error)
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 })
  }
}
