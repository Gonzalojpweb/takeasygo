import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import Location from '@/models/Location'
import UserLocationRole, { LOCATION_ROLES, type LocationRole } from '@/models/UserLocationRole'

/**
 * M2 — Panel de asignación de roles por sede (user_location_roles).
 *
 * Reglas (aprobadas por Gonzalo):
 *  - nadie asigna un rol mayor o igual al suyo (salvo admin/superadmin);
 *  - el acceso a todo el tenant (locationId = null) solo lo da un admin;
 *  - todo cambio queda en la bitácora (logAudit);
 *  - doble escritura: al crear/editar una fila de tenant se refleja en
 *    User.role (borrarla no toca User.role — no hay estado anterior);
 *  - el flag rbac.sedeScope sigue apagado: esto es solo administración,
 *    la coerción de permisos viene en M3.
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

interface Actor {
  id: string
  role: string
  tenantId: string
}

async function authorize(
  request: NextRequest,
  tenantId: string
): Promise<{ actor: Actor; rank: number } | NextResponse> {
  const user = await getSessionUser(request)
  if (!user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const actor: Actor = {
    id: user.id,
    role: user.role ?? '',
    tenantId: user.tenantId ?? '',
  }
  if (actor.role !== 'superadmin' && actor.tenantId !== tenantId) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }
  const rank = ROLE_RANK[actor.role] ?? 0
  if (rank < ROLE_RANK.manager) {
    return NextResponse.json({ error: 'Se requiere admin o manager' }, { status: 403 })
  }
  return { actor, rank }
}

function isNextResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse
}

// Sedes propias de un manager: filas activas con locationId no nulo.
async function managerOwnLocations(tenantId: string, actorId: string): Promise<Set<string>> {
  const rows = await UserLocationRole.find({
    tenantId,
    userId: actorId,
    locationId: { $ne: null },
    isActive: true,
  })
    .lean()
  return new Set(rows.map((r) => String(r.locationId)))
}

// Es el último usuario con rol admin del tenant?
async function isLastTenantAdmin(tenantId: string, userId: string): Promise<boolean> {
  const others = await User.countDocuments({
    tenantId,
    role: 'admin',
    isActive: true,
    _id: { $ne: userId },
  })
  return others === 0
}

// ============================================================================
// GET /api/[tenant]/admin/user-location-roles?userId=…
// ============================================================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const auth = await authorize(request, tenant._id.toString())
    if (isNextResponse(auth)) return auth

    const userId = request.nextUrl.searchParams.get('userId')
    const query: Record<string, unknown> = { tenantId: tenant._id, isActive: true }
    if (userId) query.userId = userId

    const rows = await UserLocationRole.find(query)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean()

    return NextResponse.json({ roles: rows })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// ============================================================================
// POST /api/[tenant]/admin/user-location-roles  (upsert)
// body: { userId, locationId: string | null, role }
// ============================================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const auth = await authorize(request, tenant._id.toString())
    if (isNextResponse(auth)) return auth
    const { actor, rank } = auth

    const body = await request.json()
    const { userId, role } = body as { userId?: string; role?: string }
    const locationId = body.locationId ?? null

    if (!userId || !role) {
      return NextResponse.json({ error: 'userId y role son obligatorios' }, { status: 400 })
    }
    if (!(LOCATION_ROLES as string[]).includes(role)) {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
    }

    // Nadie edita sus propias filas
    if (userId === actor.id) {
      return NextResponse.json({ error: 'No podés modificar tus propios roles' }, { status: 403 })
    }

    const isAdminLevel = rank >= ROLE_RANK.admin
    // Nadie asigna un rol mayor o igual al suyo (salvo admin/superadmin)
    if (!isAdminLevel && (ROLE_RANK[role] ?? 0) >= rank) {
      return NextResponse.json({ error: 'No podés asignar un rol igual o mayor al tuyo' }, { status: 403 })
    }
    // admin y auditor solo los asigna un admin
    if (!isAdminLevel && (role === 'admin' || role === 'auditor')) {
      return NextResponse.json({ error: 'Solo un admin puede asignar este rol' }, { status: 403 })
    }
    // El acceso a todo el tenant solo lo da un admin
    if (locationId == null && !isAdminLevel) {
      return NextResponse.json({ error: 'Solo un admin puede asignar roles de todo el tenant' }, { status: 403 })
    }
    // Un manager solo asigna dentro de sus propias sedes
    if (!isAdminLevel && locationId != null) {
      const own = await managerOwnLocations(tenant._id.toString(), actor.id)
      if (!own.has(String(locationId))) {
        return NextResponse.json({ error: 'Solo podés asignar en tus propias sedes' }, { status: 403 })
      }
    }

    const target = await User.findOne({ _id: userId, tenantId: tenant._id })
    if (!target) return NextResponse.json({ error: 'Usuario no encontrado en este tenant' }, { status: 404 })

    if (locationId != null) {
      const loc = await Location.findOne({ _id: locationId, tenantId: tenant._id, isActive: true })
      if (!loc) return NextResponse.json({ error: 'Sede no encontrada en este tenant' }, { status: 404 })
    }

    const key = { tenantId: tenant._id, userId: target._id, locationId }
    const previous = await UserLocationRole.findOne(key).lean()

    // El tenant no puede quedarse sin admin: no se degrada la fila de
    // tenant del último admin
    const prev = previous as { role?: string; locationId?: unknown } | null
    if (
      prev?.role === 'admin' &&
      prev.locationId == null &&
      role !== 'admin' &&
      (await isLastTenantAdmin(tenant._id.toString(), String(target._id)))
    ) {
      return NextResponse.json({ error: 'No se puede dejar el tenant sin admin' }, { status: 403 })
    }

    const row = await UserLocationRole.findOneAndUpdate(
      key,
      { $set: { role, isActive: true }, $setOnInsert: { tenantId: tenant._id, userId: target._id, locationId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )

    // Doble escritura: la fila de tenant (locationId null) refleja User.role
    if (locationId == null && target.role !== role) {
      await User.updateOne({ _id: target._id }, { $set: { role } })
    }

    logAudit({
      tenantId: tenant._id.toString(),
      action: previous ? 'user_location_role.updated' : 'user_location_role.created',
      entity: 'user_location_role',
      entityId: String(row._id),
      details: {
        targetUserId: String(target._id),
        locationId: locationId ?? null,
        role,
        previousRole: (previous as { role?: string } | null)?.role ?? null,
        actorRole: actor.role,
      },
      request,
    })

    return NextResponse.json({ role: row }, { status: previous ? 200 : 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
