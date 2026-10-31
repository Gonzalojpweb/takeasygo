import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import Tenant from '@/models/Tenant'
import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireTenantRole, ADMIN_ROLES } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'

// Roles que un admin puede crear — nunca puede escalar a admin ni superadmin.
// operations_manager (Gerente de operaciones) y kitchen_lead (Jefe de cocina)
// gestionan inventario; no operan caja ni POS.
const ALLOWED_ROLES = ['manager', 'operations_manager', 'kitchen_lead', 'staff', 'cashier'] as const

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'users.read',
    })
    if (permError) return permError

    const users = await User.find({ tenantId: tenant._id }).select('-password')
    return NextResponse.json({ users })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireTenantRole(request, tenant._id.toString(), ADMIN_ROLES)
    if (authError) return authError

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'users.write',
    })
    if (permError) return permError

    const { name, email, password, role, assignedLocations = [] } = await request.json()

    // Tipos antes de cualquier query: un `email` objeto ({ $ne: null }) llegaba
    // crudo a User.findOne (inyección de operadores).
    if (
      typeof name !== 'string' || !name.trim() || name.length > 100 ||
      typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200 ||
      typeof password !== 'string' || password.length < 8 || password.length > 200 ||
      !Array.isArray(assignedLocations) || assignedLocations.some((id: unknown) => typeof id !== 'string')
    ) {
      return NextResponse.json({ error: 'Datos inválidos (nombre, email válido y contraseña de 8+ caracteres)' }, { status: 400 })
    }

    // ✅ Prevenir privilege escalation: solo se permiten roles menores
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Rol inválido. Los roles permitidos son: ${ALLOWED_ROLES.join(', ')}` },
        { status: 400 }
      )
    }

    const existing = await User.findOne({ email })
    if (existing) return NextResponse.json({ error: 'El email ya está en uso' }, { status: 400 })

    const hashedPassword = await bcrypt.hash(password, 12)

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      tenantId: tenant._id,
      assignedLocations: assignedLocations,
    })

    const { password: _, ...userWithoutPassword } = user.toObject()
    return NextResponse.json({ user: userWithoutPassword }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}