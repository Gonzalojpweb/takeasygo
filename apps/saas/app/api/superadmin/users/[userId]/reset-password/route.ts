import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

// PATCH — reset a user's password
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    try {
        const authError = await requireSuperAdmin()
        if (authError) return authError

        const { userId } = await params
        const { password } = await request.json()

        if (typeof password !== 'string' || password.length < 8) {
            return NextResponse.json(
                { error: 'La contraseña debe tener al menos 8 caracteres.' },
                { status: 400 }
            )
        }

        await connectDB()

        // Recuperación del SuperAdmin (19/11/2026): la contraseña de una cuenta
        // superadmin no se cambia desde el panel (una sesión robada podía dejar
        // afuera al dueño). Solo por el procedimiento offline.
        const target = await User.findById(userId).select('role tenantId').lean<{ role?: string; tenantId?: unknown }>()
        if (!target) {
            return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 })
        }
        if (target.role === 'superadmin') {
            return NextResponse.json({ error: 'Las cuentas SuperAdmin no se modifican desde el panel.' }, { status: 403 })
        }

        const hashedPassword = await bcrypt.hash(password, 12)
        const user = await User.findByIdAndUpdate(
            userId,
            // Cierre global: las sesiones previas del usuario dejan de valer.
            { password: hashedPassword, sessionsValidAfter: new Date(Math.floor(Date.now() / 1000) * 1000) },
            { new: true }
        ).select('-password')

        if (!user) {
            return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 })
        }

        await logAudit({
            tenantId: target.tenantId ? String(target.tenantId) : null,
            action: 'superadmin.user_password_reset',
            entity: 'user',
            entityId: userId,
            request,
        })

        return NextResponse.json({ user })
    } catch (error) {
        console.error('[superadmin/users/[userId]/reset-password]', error)
        return NextResponse.json({ error: 'Error al cambiar la contraseña.' }, { status: 500 })
    }
}
