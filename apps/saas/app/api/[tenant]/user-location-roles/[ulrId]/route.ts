import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import UserLocationRole, { LOCATION_ROLES } from '@/models/UserLocationRole'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

// PATCH — actualiza rol o estado de una asignación
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; ulrId: string }> }
) {
  try {
    const { tenant: tenantSlug, ulrId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const ulr = await UserLocationRole.findOne({ _id: ulrId, tenantId: tenant._id })
    if (!ulr) return NextResponse.json({ error: 'Asignación no encontrada' }, { status: 404 })

    const { role, isActive } = await request.json()

    if (role !== undefined) {
      if (!LOCATION_ROLES.includes(role)) {
        return NextResponse.json(
          { error: `Rol inválido. Roles permitidos: ${LOCATION_ROLES.join(', ')}` },
          { status: 400 }
        )
      }
      ulr.role = role
    }

    if (isActive !== undefined) {
      ulr.isActive = Boolean(isActive)
    }

    await ulr.save()

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'user_location_role.update',
      entity: 'UserLocationRole',
      entityId: ulr._id.toString(),
      details: { role: ulr.role, isActive: ulr.isActive },
      request,
    })

    return NextResponse.json({ assignment: { _id: ulr._id.toString(), role: ulr.role, isActive: ulr.isActive } })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// DELETE — elimina una asignación
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; ulrId: string }> }
) {
  try {
    const { tenant: tenantSlug, ulrId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const ulr = await UserLocationRole.findOneAndDelete({ _id: ulrId, tenantId: tenant._id })
    if (!ulr) return NextResponse.json({ error: 'Asignación no encontrada' }, { status: 404 })

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'user_location_role.delete',
      entity: 'UserLocationRole',
      entityId: ulrId,
      details: { userId: ulr.userId.toString(), locationId: ulr.locationId?.toString() ?? null, role: ulr.role },
      request,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
