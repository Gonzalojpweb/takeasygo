import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { superadminCreateUserSchema } from '@/lib/schemas'

export async function POST(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const parsed = superadminCreateUserSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const { name, email, password, role, tenantId } = parsed.data

    await connectDB()

    const existing = await User.findOne({ email })
    if (existing) return NextResponse.json({ error: 'El email ya está en uso' }, { status: 400 })

    const hashedPassword = await bcrypt.hash(password, 12)
    const user = await User.create({ name, email, password: hashedPassword, role, tenantId })

    return NextResponse.json({ user }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear el usuario' }, { status: 500 })
  }
}