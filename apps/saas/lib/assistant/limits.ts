import mongoose from 'mongoose'
import AssistantLog from '@/models/AssistantLog'
import { rateLimit } from '@/lib/rateLimit'
import { ASSISTANT_LIMITS, monthlyBudgetUsd } from './config'
import type { AssistantContext } from './context'
import type { FixedReplyKind } from './guard'

// ============================================================================
// TEO — cuotas por usuario y tope de gasto (harness §«Límites, costo y bitácora»)
// ============================================================================

/** Gasto del mes cacheado por instancia (evita un aggregate por mensaje). */
let spendCache: { month: string; at: number; usd: number } | null = null
const SPEND_TTL_MS = 60_000

function monthKey(now: Date): string {
  return now.toISOString().slice(0, 7)
}

export async function monthSpendUsd(now: Date = new Date()): Promise<number> {
  const month = monthKey(now)
  if (spendCache && spendCache.month === month && now.getTime() - spendCache.at < SPEND_TTL_MS) return spendCache.usd
  const from = new Date(`${month}-01T00:00:00.000Z`)
  const [row] = await AssistantLog.aggregate<{ usd: number }>([
    { $match: { createdAt: { $gte: from } } },
    { $group: { _id: null, usd: { $sum: '$costUsd' } } },
  ])
  spendCache = { month, at: now.getTime(), usd: row?.usd ?? 0 }
  return spendCache.usd
}

/** Solo para tests. */
export function __resetSpendCacheForTests(): void {
  spendCache = null
}

/** null = puede seguir; si no, la respuesta fija que corresponde. */
export async function checkLimits(ctx: AssistantContext, now: Date = new Date()): Promise<FixedReplyKind | null> {
  const minute = await rateLimit(`assistant:${ctx.tenantId}:${ctx.userId}`, ASSISTANT_LIMITS.perUserPerMinute, 60_000)
  if (!minute.success) return 'limite_minuto'

  const dayStart = new Date(now)
  dayStart.setUTCHours(0, 0, 0, 0)
  const today = await AssistantLog.countDocuments({
    tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
    userId: ctx.userId,
    createdAt: { $gte: dayStart },
  })
  if (today >= ASSISTANT_LIMITS.perUserPerDay) return 'limite_dia'

  if ((await monthSpendUsd(now)) >= monthlyBudgetUsd()) return 'limite_gasto'
  return null
}

const REFUSAL_TEXT = /queda fuera de lo que puedo hacer|estoy (ac[aá]|aqu[ií]) solo para ayudarte|no puedo (cambiar mi rol|mostrar mi configuraci[oó]n)/i

/** ¿Este intercambio fue un rechazo (filtro o respuesta de rechazo del modelo)? */
export function wasRefusal(log: { filter?: string | null; reply: string }): boolean {
  if (log.filter && ['entrada', 'salida', 'rechazo_modelo', 'insistencia'].includes(log.filter)) return true
  return REFUSAL_TEXT.test(log.reply)
}

/** Rechazos seguidos al final de la conversación (más reciente primero). */
export function consecutiveRefusals(recentFirst: readonly { filter?: string | null; reply: string }[]): number {
  let n = 0
  for (const log of recentFirst) {
    if (!wasRefusal(log)) break
    n++
  }
  return n
}
