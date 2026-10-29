import mongoose from 'mongoose'
import AssistantLog, { type AssistantFilter } from '@/models/AssistantLog'
import { ASSISTANT_LIMITS } from './config'
import type { AssistantContext } from './context'
import type { HistoryTurn } from './prompt'

// ============================================================================
// TEO — bitácora (harness §«Bitácora»). Cada intercambio queda registrado,
// también los que cortó un filtro o un límite. El historial que se reenvía al
// modelo sale de acá (servidor), nunca del cliente: un historial armado por el
// front permitiría inventar turnos del asistente.
// ============================================================================

export interface AuditEntry {
  conversationId: string
  question: string
  reply: string
  docs?: string[]
  filter?: AssistantFilter
  model?: string | null
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  costUsd?: number
  latencyMs?: number
}

export async function logExchange(ctx: AssistantContext, entry: AuditEntry): Promise<string | null> {
  try {
    const doc = await AssistantLog.create({
      tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
      userId: ctx.userId,
      conversationId: entry.conversationId,
      role: ctx.role,
      userRole: ctx.userRole,
      plan: ctx.plan,
      activeModules: ctx.activeModules,
      locationId: ctx.locationId,
      question: entry.question.slice(0, ASSISTANT_LIMITS.maxMessageChars),
      reply: entry.reply.slice(0, 8000),
      docs: entry.docs ?? [],
      filter: entry.filter ?? null,
      model: entry.model ?? null,
      inputTokens: entry.inputTokens ?? 0,
      outputTokens: entry.outputTokens ?? 0,
      cacheReadTokens: entry.cacheReadTokens ?? 0,
      cacheWriteTokens: entry.cacheWriteTokens ?? 0,
      costUsd: entry.costUsd ?? 0,
      latencyMs: entry.latencyMs ?? 0,
    })
    return String(doc._id)
  } catch (err) {
    // La bitácora nunca corta la respuesta al usuario.
    console.error('[assistant/audit] no se pudo registrar el intercambio:', err)
    return null
  }
}

export interface RecentLog extends HistoryTurn {
  filter: AssistantFilter
}

/** Últimos intercambios de la conversación, más reciente primero. */
export async function recentExchanges(ctx: AssistantContext, conversationId: string, limit = 6): Promise<RecentLog[]> {
  const rows = await AssistantLog.find({
    tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
    userId: ctx.userId,
    conversationId,
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('question reply filter')
    .lean<{ question: string; reply: string; filter: AssistantFilter }[]>()
  return rows.map((r) => ({ question: r.question, reply: r.reply, filter: r.filter ?? null }))
}

/** Valoración y derivación: solo sobre intercambios PROPIOS (tenant + usuario). */
export async function updateFeedback(
  ctx: Pick<AssistantContext, 'tenantId' | 'userId'>,
  logId: string,
  patch: { rating?: 1 | -1 | null; escalate?: boolean }
): Promise<boolean> {
  if (!mongoose.isValidObjectId(logId)) return false
  const $set: Record<string, unknown> = {}
  if (patch.rating !== undefined) $set.rating = patch.rating
  if (patch.escalate) {
    $set.escalated = true
    $set.escalatedAt = new Date()
  }
  if (Object.keys($set).length === 0) return false
  const res = await AssistantLog.updateOne(
    { _id: new mongoose.Types.ObjectId(logId), tenantId: new mongoose.Types.ObjectId(ctx.tenantId), userId: ctx.userId },
    { $set }
  )
  return res.matchedCount === 1
}
