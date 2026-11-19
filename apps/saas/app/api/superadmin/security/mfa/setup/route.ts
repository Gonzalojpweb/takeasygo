import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { securityContext, checkPassword } from '@/lib/superadmin-security'
import { logSystemAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * POST { password } — inicia el enrolamiento MFA: genera un secreto TOTP
 * pendiente (cifrado) y devuelve el URI para el QR. Exige la contraseña
 * actual. Solo si la cuenta todavía no tiene MFA: para cambiar de celular con
 * MFA activo se usa el procedimiento offline (o se regeneran códigos).
 */
export async function POST(request: NextRequest) {
  const ctx = await securityContext('mfa-setup', 10)
  if ('error' in ctx) return ctx.error
  const { admin } = ctx
  if (admin.mfaEnabled) {
    return NextResponse.json({ error: 'La cuenta ya tiene MFA activo.' }, { status: 409 })
  }

  const body = await request.json().catch(() => ({}))
  await connectDB()
  if (!(await checkPassword(admin.id, body?.password))) {
    await logSystemAudit({ action: 'security.superadmin_reauth_failed', entity: 'user', userId: admin.id, userRole: 'superadmin', details: { step: 'mfa_setup' }, request })
    return NextResponse.json({ error: 'Contraseña incorrecta.' }, { status: 401 })
  }

  const { generateTotpSecret, totpUri } = await import('@/lib/totp')
  const { encrypt } = await import('@/lib/crypto')
  const User = (await import('@/models/User')).default
  const secret = generateTotpSecret()
  await User.updateOne(
    { _id: admin.id, mfaEnabled: { $ne: true } },
    { $set: { mfaPendingSecret: encrypt(secret), mfaPendingAt: new Date() } },
  )
  await logSystemAudit({ action: 'security.superadmin_mfa_setup_started', entity: 'user', userId: admin.id, userName: admin.name ?? undefined, userRole: 'superadmin', request })

  return NextResponse.json(
    { secret, uri: totpUri(secret, admin.email ?? 'superadmin') },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
