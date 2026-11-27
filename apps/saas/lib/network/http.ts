// Piezas comunes de las rutas /api/superadmin/network/* (red de beneficios, etapa 3).
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { getSessionIdentity } from '@/lib/tenant-access'
import { NetworkError, type NetworkActor } from './admin'

/** Guardia de SuperAdmin (MFA verificado) + actor para la auditoría. */
export async function networkContext(request: NextRequest): Promise<{ ok: true; actor: NetworkActor } | { ok: false; response: NextResponse }> {
  const authError = await requireSuperAdmin('network', request)
  if (authError) return { ok: false, response: authError }
  const identity = await getSessionIdentity()
  return { ok: true, actor: { userId: identity?.id ?? null, name: identity?.name ?? identity?.email ?? 'Superadmin' } }
}

export function networkError(err: unknown, where: string): NextResponse {
  if (err instanceof NetworkError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
  console.error(`[network] ${where}:`, err instanceof Error ? err.message : err)
  return NextResponse.json({ error: 'Error interno' }, { status: 500 })
}

export async function readBody(request: NextRequest): Promise<unknown> {
  return request.json().catch(() => ({}))
}
