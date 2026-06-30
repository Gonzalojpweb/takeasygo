import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import { resetPasswordSchema } from '@/lib/schemas'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = resetPasswordSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { token, password } = parsed.data
    await connectDB()

    // Hashear el token recibido para comparar con lo que hay en DB
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex')

    const user = await User.findOne({
      resetToken: hashedToken,
      resetTokenExpiry: { $gt: new Date() }, // no expirado
      isActive: true,
    }).select('+resetToken +resetTokenExpiry')

    if (!user) {
      return NextResponse.json(
        { error: 'El enlace es inválido o ya expiró.' },
        { status: 400 }
      )
    }

    // Actualizar contraseña y limpiar token
    user.password = await bcrypt.hash(password, 12)
    user.resetToken = null
    user.resetTokenExpiry = null
    await user.save()

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[reset-password]', error)
    return NextResponse.json({ error: 'Error al restablecer la contraseña.' }, { status: 500 })
  }
}
