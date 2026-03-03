import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/mongoose'
import AuditLog from '@/models/AuditLog'
import { NextRequest } from 'next/server'

interface AuditOptions {
  tenantId: string
  action: string
  entity: string
  entityId?: string
  details?: Record<string, any>
  request?: NextRequest
}

/**
 * Persists an audit entry. Never throws — failures are logged to console only
 * so they don't disrupt the main request flow.
 */
export async function logAudit(options: AuditOptions): Promise<void> {
  try {
    await connectDB()
    const session = await auth()

    const ip =
      options.request?.headers.get('x-forwarded-for') ??
      options.request?.headers.get('x-real-ip') ??
      ''

    await AuditLog.create({
      tenantId: options.tenantId,
      userId: (session?.user as any)?.id ?? null,
      userName: session?.user?.name ?? session?.user?.email ?? 'Sistema',
      userRole: session?.user?.role ?? '',
      action: options.action,
      entity: options.entity,
      entityId: options.entityId ?? null,
      details: options.details ?? {},
      ip,
    })
  } catch (err) {
    console.error('[AUDIT] Error persisting audit log:', err)
  }
}
