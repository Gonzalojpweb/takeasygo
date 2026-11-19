import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import { resetPasswordSchema } from '@/lib/schemas'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { rateLimit } from '@/lib/rateLimit'
import { requestFingerprint } from '@/lib/security-alerts'

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

    const fp = requestFingerprint(request.headers)
    const byIp = await rateLimit(`reset-ip:${fp.ip || 'unknown'}`, 10, 15 * 60_000)
    if (!byIp.success) {
      return NextResponse.json({ error: 'Demasiados intentos. Esperá unos minutos.' }, { status: 429 })
    }

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

    // SuperAdmin: nunca por link de email (Fase 0). Un token viejo no sirve.
    if (user.role === 'superadmin') {
      user.resetToken = null
      user.resetTokenExpiry = null
      await user.save()
      return NextResponse.json({ error: 'El enlace es inválido o ya expiró.' }, { status: 400 })
    }

    // Actualizar contraseña y limpiar token
    user.password = await bcrypt.hash(password, 12)
    user.resetToken = null
    user.resetTokenExpiry = null
    // Cierre global: las sesiones abiertas antes del cambio dejan de valer
    // (donde se valida con la base; ver lib/apiAuth sessionCutOff).
    user.sessionsValidAfter = new Date(Math.floor(Date.now() / 1000) * 1000)
    // Abrir el link del email prueba que el email es suyo (invitación del alta rápida).
    if (!user.emailVerified) user.emailVerified = new Date()
    await user.save()

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[reset-password]', error)
    return NextResponse.json({ error: 'Error al restablecer la contraseña.' }, { status: 500 })
  }
}
