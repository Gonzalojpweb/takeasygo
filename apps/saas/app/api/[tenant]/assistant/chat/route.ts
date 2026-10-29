import { NextRequest, NextResponse } from 'next/server'
import { runAssistant } from '@/lib/assistant/harness'
import { isLlmConfigured } from '@/lib/assistant/llm'
import { ASSISTANT_LIMITS, supportWhatsapp } from '@/lib/assistant/config'
import { CONVERSATION_ID_RE, resolveAssistantContext } from '@/lib/assistant/route-context'

// ============================================================================
// /api/[tenant]/assistant/chat — TEO, asistente de soporte (v1, solo lectura)
// ============================================================================
// GET  → estado del asistente (disponible / próximamente) y canal de soporte.
// POST { conversationId, message } → { reply, logId, filter, suggestSupport }
// Auth: sesión del panel (requireAuth vía resolveAssistantContext). El rol,
// el negocio y los módulos los fija el servidor; el body solo trae el texto.
// Sin streaming en v1: el filtro de salida corta antes de mostrar.
// ============================================================================

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  const resolved = await resolveAssistantContext(request, tenant)
  if ('error' in resolved) return resolved.error
  return NextResponse.json({
    available: isLlmConfigured(),
    maxMessageChars: ASSISTANT_LIMITS.maxMessageChars,
    supportWhatsapp: supportWhatsapp(),
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  const resolved = await resolveAssistantContext(request, tenant)
  if ('error' in resolved) return resolved.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const { conversationId, message } = (body ?? {}) as { conversationId?: unknown; message?: unknown }
  if (typeof conversationId !== 'string' || !CONVERSATION_ID_RE.test(conversationId)) {
    return NextResponse.json({ error: 'conversationId inválido' }, { status: 400 })
  }
  if (typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'Escribí tu consulta' }, { status: 400 })
  }
  // El filtro de entrada responde «mensaje muy largo»; acá solo se corta el abuso.
  if (message.length > ASSISTANT_LIMITS.maxMessageChars * 4) {
    return NextResponse.json({ error: 'Mensaje demasiado largo' }, { status: 413 })
  }

  const result = await runAssistant(resolved.ctx, { conversationId, message })
  return NextResponse.json({
    reply: result.reply,
    logId: result.logId,
    filter: result.filter,
    suggestSupport: result.suggestSupport,
  })
}
