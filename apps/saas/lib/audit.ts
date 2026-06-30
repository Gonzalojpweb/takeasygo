import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/mongoose'
import AuditLog from '@/models/AuditLog'
import { NextRequest } from 'next/server'

interface AuditOptions {
  tenantId: string | null
  action: string
  entity: string
  entityId?: string
  details?: Record<string, any>
  request?: NextRequest
  // Provide these to skip the internal auth() call (use in signIn/signOut events)
  userId?: string | null
  userName?: string
  userRole?: string
}

/**
 * Persists an audit entry. Never throws — failures are logged to console only
 * so they don't disrupt the main request flow.
 *
 * If tenantId is null/empty (e.g. superadmin), the entry is silently skipped
 * because AuditLog is tenant-scoped.
 *
 * Pass userId/userName/userRole directly when calling from NextAuth events to
 * avoid a circular auth() call that can trigger JWTSessionError.
 */
export async function logAudit(options: AuditOptions): Promise<void> {
  if (!options.tenantId) return  // superadmin or system — no tenant-scoped log

  try {
    await connectDB()

    // Only call auth() when user identity is not supplied by the caller.
    // Avoid calling auth() inside NextAuth events (the JWT may not exist yet).
    let userId   = options.userId   ?? null
    let userName = options.userName ?? 'Sistema'
    let userRole = options.userRole ?? ''

    if (options.userId === undefined) {
      const session = await auth()
      userId   = (session?.user as any)?.id ?? null
      userName = session?.user?.name ?? session?.user?.email ?? 'Sistema'
      userRole = (session?.user as any)?.role ?? ''
    }

    const ip =
      options.request?.headers.get('x-forwarded-for') ??
      options.request?.headers.get('x-real-ip') ??
      ''

    await AuditLog.create({
      tenantId: options.tenantId,
      userId,
      userName,
      userRole,
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
