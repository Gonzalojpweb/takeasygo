import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

/**
 * Roles que se pueden crear para un comercio desde el superadmin
 * (Recuperación del SuperAdmin, Fase 0 — 19/11/2026). Nunca superadmin:
 * antes el rol salía del body sin filtro y una sesión robada podía crear
 * otro SuperAdmin como persistencia. consumer y member tampoco (no son
 * staff de un comercio).
 */
const TENANT_CREATABLE_ROLES = new Set([
    'admin', 'manager', 'operations_manager', 'kitchen_lead', 'staff',
    'cashier', 'waiter', 'host', 'auditor', 'seller',
])

// GET — list all users for a tenant (passwords excluded)
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ tenantId: string }> }
) {
    try {
        const authError = await requireSuperAdmin()
        if (authError) return authError

        const { tenantId } = await params

        await connectDB()
        const users = await User.find({ tenantId })
            .select('-password')
            .sort({ createdAt: 1 })
            .lean()

        return NextResponse.json({ users })
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 })
    }
}

// POST — create a new user for an existing tenant
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ tenantId: string }> }
) {
    try {
        const authError = await requireSuperAdmin()
        if (authError) return authError

        const { tenantId } = await params
        const { name, email, password, role = 'admin', assignedLocations = [] } = await request.json()

        if (typeof role !== 'string' || !TENANT_CREATABLE_ROLES.has(role)) {
            return NextResponse.json({ error: 'Rol no permitido.' }, { status: 400 })
        }
        if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
            return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 })
        }

        if (!name || !email || !password) {
            return NextResponse.json(
                { error: 'Nombre, email y contraseña son requeridos.' },
                { status: 400 }
            )
        }

        await connectDB()

        const existing = await User.findOne({ email: email.toLowerCase() })
        if (existing) {
            return NextResponse.json(
                { error: 'El email ya está en uso por otro usuario.' },
                { status: 400 }
            )
        }

        const hashedPassword = await bcrypt.hash(password, 12)
        
        const userData: any = {
            name,
            email: email.toLowerCase(),
            password: hashedPassword,
            role,
            assignedLocations,
        }

        if (role === 'seller') {
            userData.assignedTenants = [tenantId]
            userData.tenantId = null
        } else {
            userData.tenantId = tenantId
        }

        const user = await User.create(userData)

        await logAudit({
            tenantId: role === 'seller' ? null : tenantId,
            action: 'superadmin.user_created',
            entity: 'user',
            entityId: user._id.toString(),
            details: { role, email: user.email, forTenant: tenantId },
            request,
        })

        const { password: _pwd, ...safeUser } = user.toObject()
        return NextResponse.json({ user: safeUser }, { status: 201 })
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 })
    }
}
