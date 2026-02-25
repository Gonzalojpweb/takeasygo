import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'

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
        const { name, email, password, role = 'admin' } = await request.json()

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
        const user = await User.create({
            name,
            email: email.toLowerCase(),
            password: hashedPassword,
            role,
            tenantId,
        })

        // Return user without password
        const { password: _pwd, ...safeUser } = user.toObject()
        return NextResponse.json({ user: safeUser }, { status: 201 })
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 })
    }
}
