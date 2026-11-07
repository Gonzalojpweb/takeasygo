/**
 * lib/organizations/http.ts — piezas comunes de las rutas de organización (PR 9a).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { getSessionIdentity } from '@/lib/tenant-access'
import { OrgError, type AuditActor } from './service'

/** Guardia de superadmin + actor para la auditoría. */
export async function superadminContext(request: NextRequest): Promise<{ ok: true; actor: AuditActor } | { ok: false; response: NextResponse }> {
  const authError = await requireSuperAdmin('organizations', request)
  if (authError) return { ok: false, response: authError }
  const identity = await getSessionIdentity()
  return {
    ok: true,
    actor: { userId: identity?.id ?? null, name: identity?.name ?? identity?.email ?? 'Superadmin', role: 'superadmin' },
  }
}

/** OrgError → respuesta con el mensaje en español; el resto → 500 sin detalles. */
export function orgErrorResponse(err: unknown, where: string): NextResponse {
  if (err instanceof OrgError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
  }
  console.error(`[organizations] ${where}:`, err)
  return NextResponse.json({ error: 'Error interno' }, { status: 500 })
}

export async function readJson(request: NextRequest): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null)
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
}

export function appBaseUrl(request: NextRequest): string {
  return process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
}
