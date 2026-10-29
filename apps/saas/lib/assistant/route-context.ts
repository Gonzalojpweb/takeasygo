import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { getSessionUser, requireAuth } from '@/lib/apiAuth'
import Tenant from '@/models/Tenant'
import type { Plan } from '@/lib/plans'
import { buildContext, type AssistantContext } from './context'

// ============================================================================
// TEO — contexto de una petición HTTP: sesión validada + tenant de la URL.
// Negocio, rol y plan salen del servidor; el body nunca los aporta.
// ============================================================================

export async function resolveAssistantContext(
  request: NextRequest,
  tenantSlug: string
): Promise<{ ctx: AssistantContext } | { error: NextResponse }> {
  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('_id name plan')
    .lean<{ _id: unknown; name?: string; plan?: Plan }>()
  if (!tenant) return { error: NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 }) }

  const authError = await requireAuth(request, String(tenant._id))
  if (authError) return { error: authError }

  const user = await getSessionUser(request)
  if (!user?.id || !user.role) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }

  const ctx = buildContext({
    tenant,
    user: { id: String(user.id), role: String(user.role), assignedLocation: user.assignedLocation ?? null },
  })
  if (!ctx) return { error: NextResponse.json({ error: 'Tu rol no tiene acceso al asistente' }, { status: 403 }) }
  return { ctx }
}

export const CONVERSATION_ID_RE = /^[a-zA-Z0-9-]{8,64}$/
