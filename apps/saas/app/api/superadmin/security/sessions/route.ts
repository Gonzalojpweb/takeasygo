import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { securityContext, sessionCutoffNow } from '@/lib/superadmin-security'
import { logSystemAudit } from '@/lib/audit'
import { sendSecurityAlert, requestFingerprint } from '@/lib/security-alerts'

export const dynamic = 'force-dynamic'

/**
 * POST — cierra TODAS las sesiones de la cuenta SuperAdmin (incluida esta).
 * Botón de pánico: no pide contraseña para poder usarse rápido si se
 * sospecha que alguien más tiene una sesión abierta.
 */
export async function POST(request: NextRequest) {
  const ctx = await securityContext('sessions', 10)
  if ('error' in ctx) return ctx.error
  const { admin } = ctx

  await connectDB()
  const User = (await import('@/models/User')).default
  await User.updateOne({ _id: admin.id }, { $set: { sessionsValidAfter: sessionCutoffNow() } })

  const fp = requestFingerprint(request.headers)
  await logSystemAudit({ action: 'security.superadmin_sessions_revoked', entity: 'user', userId: admin.id, userName: admin.name ?? undefined, userRole: 'superadmin', ip: fp.ip, userAgent: fp.userAgent })
  await sendSecurityAlert({
    accountEmail: admin.email,
    subject: 'Se cerraron todas las sesiones de SuperAdmin',
    summary: 'Se cerraron todas las sesiones abiertas de la cuenta SuperAdmin desde el panel de Seguridad.',
    ip: fp.ip, userAgent: fp.userAgent,
  })

  return NextResponse.json({ ok: true })
}
