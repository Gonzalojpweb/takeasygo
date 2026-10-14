import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import UserLocationRole, { LOCATION_ROLES } from '@/models/UserLocationRole'
import Location from '@/models/Location'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

// GET — lista asignaciones de roles por sede del tenant, con nombre de usuario y sede
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const ulrs = await UserLocationRole.find({ tenantId: tenant._id })
      .populate('userId', 'name email')
      .populate('locationId', 'name')
      .sort({ createdAt: -1 })
      .lean()

    const serialized = ulrs.map((u: any) => ({
      _id: u._id.toString(),
      userId: u.userId?._id?.toString() ?? u.userId?.toString(),
      userName: u.userId?.name ?? 'Desconocido',
      userEmail: u.userId?.email ?? '',
      locationId: u.locationId?._id?.toString() ?? null,
      locationName: u.locationId?.name ?? 'Todas las sedes',
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
    }))

    return NextResponse.json({ assignments: serialized })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// POST — crea o actualiza una asignación (upsert por tenantId+userId+locationId)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const { userId, locationId = null, role, isActive = true } = await request.json()

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }

    if (!ROLE_VALID.includes(role)) {
      return NextResponse.json(
        { error: `Rol inválido. Roles permitidos: ${ROLE_VALID.join(', ')}` },
        { status: 400 }
      )
    }

    // Validar que la sede pertenece al tenant (si no es null)
    if (locationId !== null) {
      if (typeof locationId !== 'string') {
        return NextResponse.json({ error: 'locationId inválido' }, { status: 400 })
      }
      const location = await Location.findOne({ _id: locationId, tenantId: tenant._id })
      if (!location) {
        return NextResponse.json({ error: 'La sede no pertenece a este tenant' }, { status: 400 })
      }
    }

    // Verificar que el usuario pertenece al tenant
    const User = (await import('@/models/User')).default
    const user = await User.findOne({ _id: userId, tenantId: tenant._id })
    if (!user) {
      return NextResponse.json({ error: 'El usuario no pertenece a este tenant' }, { status: 400 })
    }

    const ulr = await UserLocationRole.findOneAndUpdate(
      { tenantId: tenant._id, userId, locationId },
      { role, isActive },
      { new: true, upsert: true, runValidators: true }
    )

    logAudit({
      tenantId: tenant._id.toString(),
      action: locationId ? 'user_location_role.upsert' : 'user_location_role.upsert_tenant_wide',
      entity: 'UserLocationRole',
      entityId: ulr._id.toString(),
      details: { userId, locationId, role, isActive },
      request,
    })

    return NextResponse.json({ assignment: { _id: ulr._id.toString(), userId, locationId, role, isActive } }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

const ROLE_VALID = LOCATION_ROLES
