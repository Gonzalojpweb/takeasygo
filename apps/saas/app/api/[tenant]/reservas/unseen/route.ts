import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { FLOOR_ROLES, requireTenantRole } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { scopeLocationFilter } from '@/lib/location-scope'
import { acknowledgeReservations, countUnseenReservations } from '@/lib/reservations/unseen'

// ============================================================================
// GET  /api/[tenant]/reservas/unseen?locationId= — cantidad de reservas
//      nuevas sin ver (badge del menú «Reservaciones», obs. 24/10).
// POST /api/[tenant]/reservas/unseen?locationId= — las marca vistas (lo
//      llama el panel de reservas al abrirse). Ver lib/reservations/unseen.
// Mismo alcance que el listado de reservas: permiso reservations.read y
// solo las sedes del usuario.
// ============================================================================

async function context(request: NextRequest, tenantSlug: string) {
  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id slug plan').lean()
  if (!tenant) return { error: NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 }) }
  const authError = await requireTenantRole(request, tenant._id.toString(), FLOOR_ROLES)
  if (authError) return { error: authError }
  const locationId = new URL(request.url).searchParams.get('locationId')
  const permError = await enforcePermissionForRequest(request, {
    tenant,
    tenantId: tenant._id.toString(),
    locationId,
    permission: 'reservations.read',
  })
  if (permError) return { error: permError }
  const scope = await scopeLocationFilter(request, locationId)
  if ('error' in scope) return { error: scope.error }
  return { tenant, scope: scope.filter }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const ctx = await context(request, (await params).tenant)
    if ('error' in ctx) return ctx.error
    return NextResponse.json({ count: await countUnseenReservations(ctx.tenant._id, ctx.scope) })
  } catch (error) {
    console.error('[reservas/unseen] GET', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const ctx = await context(request, (await params).tenant)
    if ('error' in ctx) return ctx.error
    return NextResponse.json({ acknowledged: await acknowledgeReservations(ctx.tenant._id, ctx.scope) })
  } catch (error) {
    console.error('[reservas/unseen] POST', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
