import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'

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

        if (!password || password.length < 8) {
            return NextResponse.json(
                { error: 'La contraseña debe tener al menos 8 caracteres.' },
                { status: 400 }
            )
        }

        await connectDB()

        const hashedPassword = await bcrypt.hash(password, 12)
        const user = await User.findByIdAndUpdate(
            userId,
            { password: hashedPassword },
            { new: true }
        ).select('-password')

        if (!user) {
            return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 })
        }

        return NextResponse.json({ user })
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 })
    }
}
