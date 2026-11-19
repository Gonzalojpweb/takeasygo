import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { connectDB } from '@/lib/mongoose'
import { securityContext, checkPassword, checkTotp, sessionCutoffNow } from '@/lib/superadmin-security'
import { logSystemAudit } from '@/lib/audit'
import { sendSecurityAlert, requestFingerprint } from '@/lib/security-alerts'

export const dynamic = 'force-dynamic'

/**
 * POST { currentPassword, code, newPassword } — cambio de contraseña del
 * SuperAdmin con reautenticación fuerte (contraseña actual + TOTP). Cierra
 * todas las sesiones y avisa por email.
 */
export async function POST(request: NextRequest) {
  const ctx = await securityContext('password', 5)
  if ('error' in ctx) return ctx.error
  const { admin } = ctx
  if (!admin.mfaEnabled) return NextResponse.json({ error: 'Primero activá MFA.' }, { status: 409 })

  const body = await request.json().catch(() => ({}))
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : ''
  if (newPassword.length < 12) {
    return NextResponse.json({ error: 'La contraseña nueva debe tener al menos 12 caracteres.' }, { status: 400 })
  }

  await connectDB()
  const fp = requestFingerprint(request.headers)
  if (!(await checkPassword(admin.id, body?.currentPassword)) || !(await checkTotp(admin.id, body?.code))) {
    await logSystemAudit({ action: 'security.superadmin_reauth_failed', entity: 'user', userId: admin.id, userRole: 'superadmin', details: { step: 'password' }, ip: fp.ip, userAgent: fp.userAgent })
    return NextResponse.json({ error: 'Contraseña actual o código incorrectos.' }, { status: 401 })
  }
  if (await checkPassword(admin.id, newPassword)) {
    return NextResponse.json({ error: 'La contraseña nueva tiene que ser distinta de la actual.' }, { status: 400 })
  }

  const User = (await import('@/models/User')).default
  await User.updateOne(
    { _id: admin.id },
    { $set: { password: await bcrypt.hash(newPassword, 12), sessionsValidAfter: sessionCutoffNow() } },
  )

  await logSystemAudit({ action: 'security.superadmin_password_changed', entity: 'user', userId: admin.id, userName: admin.name ?? undefined, userRole: 'superadmin', ip: fp.ip, userAgent: fp.userAgent })
  await sendSecurityAlert({
    accountEmail: admin.email,
    subject: 'Contraseña de SuperAdmin cambiada',
    summary: 'Se cambió la contraseña de la cuenta SuperAdmin y se cerraron todas las sesiones.',
    ip: fp.ip, userAgent: fp.userAgent,
  })

  return NextResponse.json({ ok: true })
}
