import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import UserLocationRole from '@/models/UserLocationRole'

/**
 * DELETE /api/[tenant]/admin/user-location-roles/[id]
 *
 * Borra una fila de rol por sede. Reglas:
 *  - actor admin/manager del tenant (o superadmin);
 *  - un manager no borra filas de tenant (locationId null) ni roles admin;
 *  - NO se toca User.role al borrar (doble escritura aplica a altas/cambios);
 *  - todo queda en la bitácora.
 */

const ROLE_RANK: Record<string, number> = {
  superadmin: 200,
  admin: 100,
  manager: 50,
  cashier: 10,
  waiter: 10,
  host: 10,
  auditor: 10,
  staff: 10,
  seller: 10,
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; id: string }> }
) {
  try {
    const { tenant: tenantSlug, id } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const user = await getSessionUser(request)
    if (!user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if (user.role !== 'superadmin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }
    const rank = ROLE_RANK[user.role ?? ''] ?? 0
    if (rank < ROLE_RANK.manager) {
      return NextResponse.json({ error: 'Se requiere admin o manager' }, { status: 403 })
    }

    const row = await UserLocationRole.findOne({ _id: id, tenantId: tenant._id })
    if (!row) return NextResponse.json({ error: 'Rol no encontrado' }, { status: 404 })

    // Nadie borra sus propias filas
    if (String(row.userId) === user.id) {
      return NextResponse.json({ error: 'No podés borrar tus propios roles' }, { status: 403 })
    }

    const isAdminLevel = rank >= ROLE_RANK.admin
    if (!isAdminLevel) {
      if (row.locationId == null) {
        return NextResponse.json({ error: 'Solo un admin puede borrar roles de todo el tenant' }, { status: 403 })
      }
      if ((ROLE_RANK[row.role] ?? 0) >= rank) {
        return NextResponse.json({ error: 'No podés borrar un rol igual o mayor al tuyo' }, { status: 403 })
      }
      // Un manager solo borra dentro de sus propias sedes
      const own = await UserLocationRole.find({
        tenantId: tenant._id,
        userId: user.id,
        locationId: { $ne: null },
        isActive: true,
      })
        .lean()
      const ownSet = new Set(own.map((r) => String(r.locationId)))
      if (!ownSet.has(String(row.locationId))) {
        return NextResponse.json({ error: 'Solo podés borrar en tus propias sedes' }, { status: 403 })
      }
    }

    // El tenant no puede quedarse sin admin: no se borra la fila de
    // tenant del último admin
    if (row.locationId == null && row.role === 'admin') {
      const others = await User.countDocuments({
        tenantId: tenant._id,
        role: 'admin',
        isActive: true,
        _id: { $ne: row.userId },
      })
      if (others === 0) {
        return NextResponse.json({ error: 'No se puede dejar el tenant sin admin' }, { status: 403 })
      }
    }

    await UserLocationRole.deleteOne({ _id: row._id })

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'user_location_role.deleted',
      entity: 'user_location_role',
      entityId: String(row._id),
      details: {
        targetUserId: String(row.userId),
        locationId: row.locationId ?? null,
        role: row.role,
        actorRole: user.role,
        note: 'User.role no se modifica al borrar',
      },
      request,
    })

    return NextResponse.json({ deleted: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
