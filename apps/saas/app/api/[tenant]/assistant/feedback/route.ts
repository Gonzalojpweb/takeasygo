import { NextRequest, NextResponse } from 'next/server'
import { updateFeedback } from '@/lib/assistant/audit'
import { resolveAssistantContext } from '@/lib/assistant/route-context'

// ============================================================================
// POST /api/[tenant]/assistant/feedback { logId, rating?: 1 | -1 | null, escalate?: true }
// ============================================================================
// Pulgar arriba/abajo y «Contactar a soporte» sobre un intercambio PROPIO
// (mismo tenant y usuario). Las derivaciones las ve el superadmin en
// /superadmin/asistente.
// ============================================================================

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  const resolved = await resolveAssistantContext(request, tenant)
  if ('error' in resolved) return resolved.error

  let body: { logId?: unknown; rating?: unknown; escalate?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  if (typeof body.logId !== 'string') return NextResponse.json({ error: 'logId requerido' }, { status: 400 })
  const patch: { rating?: 1 | -1 | null; escalate?: boolean } = {}
  if (body.rating === 1 || body.rating === -1 || body.rating === null) patch.rating = body.rating
  if (body.escalate === true) patch.escalate = true
  if (patch.rating === undefined && !patch.escalate) {
    return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
  }

  const ok = await updateFeedback(resolved.ctx, body.logId, patch)
  if (!ok) return NextResponse.json({ error: 'Intercambio no encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
