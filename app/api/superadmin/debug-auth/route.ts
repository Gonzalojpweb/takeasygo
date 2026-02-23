import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import { NextResponse } from 'next/server'

// ⚠️ RUTA DE DIAGNÓSTICO TEMPORAL — ELIMINAR DESPUÉS DE USAR
export async function GET() {
    try {
        await connectDB()

        const user = await User.findOne({ email: 'pgonzalojose@gmail.com' })

        if (!user) {
            return NextResponse.json({ found: false, message: 'Usuario NO encontrado en esta base de datos' })
        }

        return NextResponse.json({
            found: true,
            email: user.email,
            name: user.name,
            role: user.role,
            isActive: user.isActive,
            hasPassword: !!user.password,
            passwordLength: user.password?.length,
            createdAt: user.createdAt,
        })
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 })
    }
}
