import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { securityContext, checkPassword, checkTotp } from '@/lib/superadmin-security'
import { logSystemAudit } from '@/lib/audit'
import { sendSecurityAlert, requestFingerprint } from '@/lib/security-alerts'

export const dynamic = 'force-dynamic'

/**
 * POST { password, code } — genera 10 códigos de recuperación nuevos (los
 * anteriores dejan de valer). Reautenticación fuerte: contraseña + TOTP.
 */
export async function POST(request: NextRequest) {
  const ctx = await securityContext('recovery-codes', 5)
  if ('error' in ctx) return ctx.error
  const { admin } = ctx
  if (!admin.mfaEnabled) return NextResponse.json({ error: 'Primero activá MFA.' }, { status: 409 })

  const body = await request.json().catch(() => ({}))
  await connectDB()
  const fp = requestFingerprint(request.headers)
  if (!(await checkPassword(admin.id, body?.password)) || !(await checkTotp(admin.id, body?.code))) {
    await logSystemAudit({ action: 'security.superadmin_reauth_failed', entity: 'user', userId: admin.id, userRole: 'superadmin', details: { step: 'recovery_codes' }, ip: fp.ip, userAgent: fp.userAgent })
    return NextResponse.json({ error: 'Contraseña o código incorrectos.' }, { status: 401 })
  }

  const { generateRecoveryCodes } = await import('@/lib/totp')
  const User = (await import('@/models/User')).default
  const codes = generateRecoveryCodes(10)
  await User.updateOne({ _id: admin.id }, { $set: { mfaRecoveryCodes: codes.hashed } })

  await logSystemAudit({ action: 'security.superadmin_recovery_codes_regenerated', entity: 'user', userId: admin.id, userName: admin.name ?? undefined, userRole: 'superadmin', ip: fp.ip, userAgent: fp.userAgent })
  await sendSecurityAlert({
    accountEmail: admin.email,
    subject: 'Códigos de recuperación regenerados',
    summary: 'Se generaron 10 códigos de recuperación nuevos para la cuenta SuperAdmin. Los anteriores ya no sirven.',
    ip: fp.ip, userAgent: fp.userAgent,
  })

  return NextResponse.json({ recoveryCodes: codes.plain }, { headers: { 'Cache-Control': 'no-store' } })
}
