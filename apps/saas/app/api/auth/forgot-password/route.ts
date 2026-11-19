import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import { sendPasswordResetEmail } from '@/lib/email'
import { forgotPasswordSchema } from '@/lib/schemas'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { rateLimit } from '@/lib/rateLimit'
import { requestFingerprint } from '@/lib/security-alerts'

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

    // Rate-limit (19/11/2026): por IP y por email. Misma respuesta genérica
    // para no revelar nada; simplemente no se manda el email.
    const fp = requestFingerprint(request.headers)
    const byIp = await rateLimit(`forgot-ip:${fp.ip || 'unknown'}`, 5, 15 * 60_000)
    const byEmail = await rateLimit(`forgot:${email.toLowerCase().trim()}`, 3, 15 * 60_000)
    if (!byIp.success || !byEmail.success) return NextResponse.json({ ok: true })

    await connectDB()

    const user = await User.findOne({ email: email.toLowerCase(), isActive: true })
      .select('+resetToken +resetTokenExpiry')

    // Si no existe, respondemos igual (no revelar existencia de cuenta)
    if (!user) {
      return NextResponse.json({ ok: true })
    }

    // Recuperación del SuperAdmin (Fase 0): el email solo NO alcanza para
    // recuperar la cuenta SuperAdmin. Se registra y se avisa, sin mandar link.
    // La recuperación es con códigos de recuperación (MFA) o el script offline.
    if (user.role === 'superadmin') {
      const { logSystemAudit } = await import('@/lib/audit')
      const { sendSecurityAlert } = await import('@/lib/security-alerts')
      await logSystemAudit({
        action: 'security.superadmin_reset_blocked', entity: 'user',
        userId: user._id.toString(), userName: user.name, userRole: 'superadmin',
        ip: fp.ip, userAgent: fp.userAgent,
      })
      await sendSecurityAlert({
        accountEmail: user.email,
        subject: 'Pedido de cambio de contraseña bloqueado',
        summary: 'Alguien pidió restablecer la contraseña de la cuenta SuperAdmin por email. Por seguridad no se envió ningún link.',
        ip: fp.ip, userAgent: fp.userAgent,
        ifNotYou: 'Si no fuiste vos, alguien conoce el email de la cuenta: revisá la auditoría en Seguridad. Si fuiste vos y perdiste el acceso, usá un código de recuperación o el procedimiento offline.',
      })
      return NextResponse.json({ ok: true })
    }

    // Generar token de 32 bytes (64 hex chars) — se envía raw en el email
    const rawToken = crypto.randomBytes(32).toString('hex')
    // Guardar hash SHA-256 en DB — si la DB se breacha, los tokens son inútiles
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex')

    user.resetToken = hashedToken
    user.resetTokenExpiry = new Date(Date.now() + TOKEN_EXPIRY_MS)
    await user.save()

    const baseUrl = process.env.APP_URL ?? 'http://localhost:3000'
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`

    await sendPasswordResetEmail(user.email, resetUrl)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[forgot-password]', error)
    // Respuesta genérica — no exponer errores internos
    return NextResponse.json({ ok: true })
  }
}
