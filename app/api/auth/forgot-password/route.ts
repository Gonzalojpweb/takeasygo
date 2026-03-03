import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import { sendPasswordResetEmail } from '@/lib/email'
import { forgotPasswordSchema } from '@/lib/schemas'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const TOKEN_EXPIRY_MS = 15 * 60 * 1000 // 15 minutos

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = forgotPasswordSchema.safeParse(body)
    if (!parsed.success) {
      // Respuesta genérica para no revelar si el email existe
      return NextResponse.json({ ok: true })
    }

    const { email } = parsed.data
    await connectDB()

    const user = await User.findOne({ email: email.toLowerCase(), isActive: true })
      .select('+resetToken +resetTokenExpiry')

    // Si no existe, respondemos igual (no revelar existencia de cuenta)
    if (!user) {
      return NextResponse.json({ ok: true })
    }

    // Generar token de 32 bytes (64 hex chars) — se envía raw en el email
    const rawToken = crypto.randomBytes(32).toString('hex')
    // Guardar hash SHA-256 en DB — si la DB se breacha, los tokens son inútiles
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex')

    user.resetToken = hashedToken
    user.resetTokenExpiry = new Date(Date.now() + TOKEN_EXPIRY_MS)
    await user.save()

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`

    await sendPasswordResetEmail(user.email, resetUrl)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[forgot-password]', error)
    // Respuesta genérica — no exponer errores internos
    return NextResponse.json({ ok: true })
  }
}
