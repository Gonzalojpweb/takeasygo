import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { getSuperAdminForSecurity } from '@/lib/superadmin-guard'

export const dynamic = 'force-dynamic'

/**
 * GET — estado de seguridad de la cuenta SuperAdmin + últimos eventos de la
 * auditoría de sistema. Accesible también sin MFA (para poder enrolarse).
 */
export async function GET() {
  const admin = await getSuperAdminForSecurity()
  if (!admin) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  await connectDB()
  const User = (await import('@/models/User')).default
  const SystemAuditLog = (await import('@/models/SystemAuditLog')).default
  const doc = await User.findById(admin.id)
    .select('+mfaRecoveryCodes mfaEnabled mfaEnabledAt email lastLoginAt sessionsValidAfter')
    .lean<{ mfaEnabled?: boolean; mfaEnabledAt?: Date | null; mfaRecoveryCodes?: string[]; email?: string; lastLoginAt?: Date | null; sessionsValidAfter?: Date | null }>()

  // Solo con MFA: sin segundo factor no se muestra la auditoría completa.
  const events = admin.mfaEnabled
    ? await SystemAuditLog.find({})
        .sort({ createdAt: -1 })
        .limit(50)
        .select('action entity entityId userName userRole ip userAgent details createdAt')
        .lean()
    : []

  return NextResponse.json({
    email: doc?.email ?? admin.email,
    mfaEnabled: Boolean(doc?.mfaEnabled),
    mfaEnabledAt: doc?.mfaEnabledAt ?? null,
    recoveryCodesLeft: doc?.mfaRecoveryCodes?.length ?? 0,
    lastLoginAt: doc?.lastLoginAt ?? null,
    sessionsValidAfter: doc?.sessionsValidAfter ?? null,
    secondChannelConfigured: Boolean(process.env.SECURITY_ALERT_EMAIL?.trim()),
    events,
  })
}
