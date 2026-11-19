import { connectDB } from '@/lib/mongoose'
import { NextRequest } from 'next/server'

interface AuditOptions {
  tenantId: string | null
  action: string
  entity: string
  entityId?: string
  locationId?: string | null
  details?: Record<string, any>
  request?: NextRequest
  // Provide these to skip the internal auth() call (use in signIn/signOut events)
  userId?: string | null
  userName?: string
  userRole?: string
}

let AuditLogModel: any = null

/**
 * Persists an audit entry. Never throws — failures are logged to console only
 * so they don't disrupt the main request flow.
 *
 * If tenantId is null/empty: superadmin actions and `security.*` events go to
 * SystemAuditLog (auditoría de sistema, 19/11/2026); anything else (p. ej.
 * logins de consumidores) se descarta como antes, porque AuditLog es por comercio.
 *
 * Pass userId/userName/userRole directly when calling from NextAuth events to
 * avoid a circular auth() call that can trigger JWTSessionError.
 */
export async function logAudit(options: AuditOptions): Promise<void> {
  if (!options.tenantId) {
    // Superadmin / seguridad → auditoría de sistema. El resto sin comercio se descarta.
    let resolved = options
    if (options.userId === undefined) {
      try {
        const { getIdentitySession } = await import('@/lib/tenant-access')
        const session = await getIdentitySession()
        const su = session?.user as { id?: string; role?: string; name?: string | null; email?: string | null } | undefined
        resolved = {
          ...options,
          userId: su?.id ?? null,
          userName: su?.name ?? su?.email ?? 'Sistema',
          userRole: su?.role ?? '',
        }
      } catch {
        resolved = { ...options, userId: null }
      }
    }
    if (isSystemAuditable(resolved)) await logSystemAudit(resolved)
    return
  }

  try {
    await connectDB()
    if (!AuditLogModel) {
      AuditLogModel = (await import('@/models/AuditLog')).default
    }

    // Only call auth() when user identity is not supplied by the caller.
    // Avoid calling auth() inside NextAuth events (the JWT may not exist yet).
    let userId   = options.userId   ?? null
    let userName = options.userName ?? 'Sistema'
    let userRole = options.userRole ?? ''

    if (options.userId === undefined) {
      const { getIdentitySession } = await import('@/lib/tenant-access')
      const session = await getIdentitySession()
      userId   = (session?.user as any)?.id ?? null
      userName = session?.user?.name ?? session?.user?.email ?? 'Sistema'
      userRole = (session?.user as any)?.role ?? ''
    }

    const ip =
      options.request?.headers.get('x-forwarded-for') ??
      options.request?.headers.get('x-real-ip') ??
      ''

    await AuditLogModel.create({
      tenantId: options.tenantId,
      userId,
      userName,
      userRole,
      action: options.action,
      entity: options.entity,
      entityId: options.entityId ?? null,
      locationId: options.locationId ?? null,
      details: options.details ?? {},
      ip,
    })
  } catch (err) {
    console.error('[AUDIT] Error persisting audit log:', err)
  }
}

// ── Auditoría de sistema (sin comercio) ─────────────────────────────────────

let SystemAuditLogModel: typeof import('@/models/SystemAuditLog').default | null = null

function isSystemAuditable(options: AuditOptions): boolean {
  const role = options.userRole ?? ''
  return role.startsWith('superadmin') || options.action.startsWith('security.')
}

export interface SystemAuditOptions {
  action: string
  entity: string
  entityId?: string | null
  details?: Record<string, unknown>
  request?: Request | NextRequest | null
  ip?: string
  userAgent?: string
  userId?: string | null
  userName?: string
  userRole?: string
}

/**
 * Persiste un evento en SystemAuditLog. Nunca lanza. No pasar secretos,
 * contraseñas, códigos MFA ni tokens en `details`.
 */
export async function logSystemAudit(options: SystemAuditOptions): Promise<void> {
  try {
    await connectDB()
    if (!SystemAuditLogModel) {
      SystemAuditLogModel = (await import('@/models/SystemAuditLog')).default
    }
    const headers = options.request?.headers
    const ip =
      options.ip ??
      headers?.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      headers?.get('x-real-ip') ??
      ''
    const userAgent = (options.userAgent ?? headers?.get('user-agent') ?? '').slice(0, 300)
    const userId = options.userId && /^[a-f0-9]{24}$/i.test(options.userId) ? options.userId : null
    await SystemAuditLogModel.create({
      userId,
      userName: options.userName ?? 'Sistema',
      userRole: options.userRole ?? '',
      action: options.action,
      entity: options.entity,
      entityId: options.entityId ?? null,
      details: options.details ?? {},
      ip,
      userAgent,
    })
  } catch (err) {
    console.error('[AUDIT] Error persisting system audit log:', err)
  }
}
