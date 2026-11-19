import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { securityContext, sessionCutoffNow } from '@/lib/superadmin-security'
import { logSystemAudit } from '@/lib/audit'
import { sendSecurityAlert, requestFingerprint } from '@/lib/security-alerts'

export const dynamic = 'force-dynamic'

const PENDING_TTL_MS = 15 * 60_000

/**
 * POST { code } — confirma el enrolamiento con el primer código de la app.
 * Activa MFA, genera 10 códigos de recuperación (se devuelven UNA sola vez,
 * se guardan hasheados) y cierra todas las sesiones: hay que volver a entrar
 * con contraseña + código.
 */
export async function POST(request: NextRequest) {
  const ctx = await securityContext('mfa-enable', 10)
  if ('error' in ctx) return ctx.error
  const { admin } = ctx
  if (admin.mfaEnabled) {
    return NextResponse.json({ error: 'La cuenta ya tiene MFA activo.' }, { status: 409 })
  }

  const body = await request.json().catch(() => ({}))
  await connectDB()
  const User = (await import('@/models/User')).default
  const doc = await User.findById(admin.id)
    .select('+mfaPendingSecret +mfaPendingAt mfaEnabled email')
    .lean<{ mfaPendingSecret?: string | null; mfaPendingAt?: Date | null; mfaEnabled?: boolean; email?: string }>()
  if (!doc?.mfaPendingSecret || !doc.mfaPendingAt || Date.now() - new Date(doc.mfaPendingAt).getTime() > PENDING_TTL_MS) {
    return NextResponse.json({ error: 'El código QR venció. Empezá de nuevo.' }, { status: 410 })
  }

  const { decrypt } = await import('@/lib/crypto')
  const { verifyTotp, generateRecoveryCodes } = await import('@/lib/totp')
  let secret = ''
  try { secret = decrypt(doc.mfaPendingSecret) } catch {
    return NextResponse.json({ error: 'No se pudo leer el secreto. Empezá de nuevo.' }, { status: 500 })
  }
  const step = verifyTotp(secret, String(body?.code ?? ''))
  if (step === null) {
    return NextResponse.json({ error: 'Código incorrecto. Revisá la hora del celular y probá con el siguiente.' }, { status: 400 })
  }

  const codes = generateRecoveryCodes(10)
  const res = await User.updateOne(
    { _id: admin.id, mfaEnabled: { $ne: true } },
    {
      $set: {
        mfaEnabled: true,
        mfaEnabledAt: new Date(),
        mfaSecret: doc.mfaPendingSecret,
        mfaRecoveryCodes: codes.hashed,
        mfaLastStep: step,
        sessionsValidAfter: sessionCutoffNow(),
      },
      $unset: { mfaPendingSecret: '', mfaPendingAt: '' },
    },
  )
  if (res.modifiedCount !== 1) {
    return NextResponse.json({ error: 'La cuenta ya tiene MFA activo.' }, { status: 409 })
  }

  const fp = requestFingerprint(request.headers)
  await logSystemAudit({ action: 'security.superadmin_mfa_enabled', entity: 'user', userId: admin.id, userName: admin.name ?? undefined, userRole: 'superadmin', ip: fp.ip, userAgent: fp.userAgent })
  await sendSecurityAlert({
    accountEmail: doc.email,
    subject: 'MFA activado en la cuenta SuperAdmin',
    summary: 'Se activó la verificación en dos pasos (app autenticadora) y se generaron 10 códigos de recuperación. Se cerraron todas las sesiones.',
    ip: fp.ip, userAgent: fp.userAgent,
  })

  return NextResponse.json({ recoveryCodes: codes.plain }, { headers: { 'Cache-Control': 'no-store' } })
}
