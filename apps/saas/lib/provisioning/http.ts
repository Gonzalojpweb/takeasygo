/**
 * Piezas comunes de las rutas del alta rápida (Superadmin).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { getSessionIdentity } from '@/lib/tenant-access'
import { ProvisionError, type ProvisionActor } from './provision'

export async function provisionContext(request: NextRequest): Promise<{ ok: true; actor: ProvisionActor } | { ok: false; response: NextResponse }> {
  const authError = await requireSuperAdmin('tenants', request)
  if (authError) return { ok: false, response: authError }
  const identity = await getSessionIdentity()
  return { ok: true, actor: { userId: identity?.id ?? null, name: identity?.name ?? identity?.email ?? 'Superadmin', email: identity?.email ?? null } }
}

export function provisionErrorResponse(err: unknown, where: string): NextResponse {
  if (err instanceof ProvisionError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
  console.error(`[provisioning] ${where}:`, err)
  return NextResponse.json({ error: 'Error interno' }, { status: 500 })
}

export function appBaseUrl(request: NextRequest): string {
  return process.env.APP_URL || process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
}
