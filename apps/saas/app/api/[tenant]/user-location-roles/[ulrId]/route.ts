import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import UserLocationRole, { LOCATION_ROLES } from '@/models/UserLocationRole'
import User from '@/models/User'
import type { Types } from 'mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole, getSessionUser } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

// Verifica que el tenant no se quede sin admin activo al quitar admin de `ulr`.
// Devuelve null si está OK, o NextResponse 400 si rompería la regla.
async function assertNotLastAdmin(
  tenantId: Types.ObjectId,
  ulr: { _id: Types.ObjectId; userId: Types.ObjectId; role: string; isActive: boolean },
  nextRole: string,
  nextActive: boolean
): Promise<NextResponse | null> {
  const removingAdmin =
    ulr.role === 'admin' && ulr.isActive && (nextRole !== 'admin' || !nextActive)
  if (!removingAdmin) return null

  const otherAdminUlr = await UserLocationRole.findOne({
    tenantId,
    role: 'admin',
    isActive: true,
    _id: { $ne: ulr._id },
  })
  const otherLegacyAdmin = await User.findOne({
    tenantId,
    role: 'admin',
    isActive: true,
    _id: { $ne: ulr.userId },
  })
  if (!otherAdminUlr && !otherLegacyAdmin) {
    return NextResponse.json(
      { error: 'No se puede quitar el último admin del tenant.' },
      { status: 400 }
    )
  }
  return null
}

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

    const sessionUser = await getSessionUser(request)
    const currentUserId = sessionUser?.id?.toString()

    const ulr = await UserLocationRole.findOne({ _id: ulrId, tenantId: tenant._id })
    if (!ulr) return NextResponse.json({ error: 'Asignación no encontrada' }, { status: 404 })

    // Regla: nadie edita sus propias filas
    const ulrUserId = ulr.userId?.toString()
    if (currentUserId && ulrUserId === currentUserId) {
      return NextResponse.json(
        { error: 'No podés modificar tu propia asignación de roles.' },
        { status: 403 }
      )
    }

    const { role, isActive } = await request.json()
    const nextRole = role !== undefined ? role : ulr.role
    const nextActive = isActive !== undefined ? Boolean(isActive) : ulr.isActive

    if (role !== undefined) {
      if (!LOCATION_ROLES.includes(role)) {
        return NextResponse.json(
          { error: `Rol inválido. Roles permitidos: ${LOCATION_ROLES.join(', ')}` },
          { status: 400 }
        )
      }
      // Nota: locationId:null (tenant-wide) puede llevar CUALQUIER rol.
      // El acceso tenant-wide lo da solo un admin (requireAdminRole ya validó
      // que quien edita es admin/superadmin).
    }

    // Regla: no dejar tenant sin admin
    const lastAdminError = await assertNotLastAdmin(tenant._id, ulr, nextRole, nextActive)
    if (lastAdminError) return lastAdminError

    ulr.role = nextRole
    ulr.isActive = nextActive
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

    const sessionUser = await getSessionUser(request)
    const currentUserId = sessionUser?.id?.toString()

    const ulr = await UserLocationRole.findOne({ _id: ulrId, tenantId: tenant._id })
    if (!ulr) return NextResponse.json({ error: 'Asignación no encontrada' }, { status: 404 })

    // Regla: nadie borra sus propias filas
    const ulrUserId = ulr.userId?.toString()
    if (currentUserId && ulrUserId === currentUserId) {
      return NextResponse.json(
        { error: 'No podés eliminar tu propia asignación de roles.' },
        { status: 403 }
      )
    }

    // Regla: no dejar tenant sin admin (borrar un admin activo)
    const lastAdminError = await assertNotLastAdmin(tenant._id, ulr, 'none', false)
    if (lastAdminError) return lastAdminError

    await UserLocationRole.deleteOne({ _id: ulrId, tenantId: tenant._id })

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'user_location_role.delete',
      entity: 'UserLocationRole',
      entityId: ulrId,
      details: { userId: ulrUserId, locationId: ulr.locationId?.toString() ?? null, role: ulr.role },
      request,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
