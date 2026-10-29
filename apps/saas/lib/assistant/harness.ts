import type { AssistantFilter } from '@/models/AssistantLog'
import { ASSISTANT_LIMITS } from './config'
import type { AssistantContext } from './context'
import { checkInput, checkOutput, fixedReply } from './guard'
import { selectDocs } from './knowledge'
import { checkLimits, consecutiveRefusals } from './limits'
import { complete, isLlmConfigured } from './llm'
import { buildMessages, buildSystem } from './prompt'
import { logExchange, recentExchanges } from './audit'

// ============================================================================
// TEO — flujo de un mensaje (harness §«Flujo de una petición», 8 pasos)
// ============================================================================
// contexto (servidor) → límites → filtro de entrada → documentos del rol y
// módulos → prompt → modelo → filtro de salida → bitácora. Si un control
// falla, mensaje fijo y el intercambio queda IGUAL en la bitácora.
// Lo usan la ruta /api/[tenant]/assistant/chat y el script de pruebas 08/09.
// ============================================================================

export interface AssistantReply {
  reply: string
  logId: string | null
  /** Qué control actuó (null = respuesta normal del modelo). */
  filter: AssistantFilter
  /** Mostrar «Contactar a soporte» destacado. */
  suggestSupport: boolean
  docs: string[]
  costUsd: number
  model: string | null
}

export interface RunOptions {
  /** Pruebas: no aplica cuotas ni registra en la bitácora. */
  dryRun?: boolean
}

export async function runAssistant(
  ctx: AssistantContext,
  input: { conversationId: string; message: string },
  options: RunOptions = {}
): Promise<AssistantReply> {
  const started = Date.now()
  const question = input.message.trim()

  const finish = async (
    reply: string,
    filter: AssistantFilter,
    extra: Partial<Omit<AssistantReply, 'reply' | 'filter' | 'logId'>> & {
      inputTokens?: number
      outputTokens?: number
      cacheReadTokens?: number
      cacheWriteTokens?: number
    } = {}
  ): Promise<AssistantReply> => {
    const logId = options.dryRun
      ? null
      : await logExchange(ctx, {
          conversationId: input.conversationId,
          question: question || '(vacío)',
          reply,
          docs: extra.docs,
          filter,
          model: extra.model ?? null,
          inputTokens: extra.inputTokens,
          outputTokens: extra.outputTokens,
          cacheReadTokens: extra.cacheReadTokens,
          cacheWriteTokens: extra.cacheWriteTokens,
          costUsd: extra.costUsd,
          latencyMs: Date.now() - started,
        })
    return {
      reply,
      logId,
      filter,
      suggestSupport: extra.suggestSupport ?? (filter === 'limite' || filter === 'insistencia' || filter === 'error'),
      docs: extra.docs ?? [],
      costUsd: extra.costUsd ?? 0,
      model: extra.model ?? null,
    }
  }

  // 0. Sin proveedor configurado: «próximamente», sin gastar ni registrar.
  if (!isLlmConfigured()) {
    return { reply: fixedReply('no_disponible'), logId: null, filter: null, suggestSupport: false, docs: [], costUsd: 0, model: null }
  }

  // 1. Cuotas y tope de gasto.
  if (!options.dryRun) {
    const blocked = await checkLimits(ctx)
    if (blocked) return finish(fixedReply(blocked), 'limite')
  }

  // 2. Filtro de entrada (conservador).
  const verdict = checkInput(question)
  if (verdict.block) return finish(fixedReply(verdict.kind!), 'entrada')

  // 3. Historial del servidor + insistencia: más de N rechazos seguidos ⇒
  //    mensaje fijo y oferta de soporte, sin gastar modelo.
  const recent = options.dryRun ? [] : await recentExchanges(ctx, input.conversationId, ASSISTANT_LIMITS.maxConsecutiveRefusals)
  if (recent.length >= ASSISTANT_LIMITS.maxConsecutiveRefusals && consecutiveRefusals(recent) >= ASSISTANT_LIMITS.maxConsecutiveRefusals) {
    return finish(fixedReply('insistencia'), 'insistencia', { suggestSupport: true })
  }
  const history = recent
    .slice(0, ASSISTANT_LIMITS.historyExchanges)
    .filter((r) => r.filter === null)
    .reverse()

  // 4. Documentos del rol y de los módulos.
  const selection = selectDocs(ctx, question)

  // 5. Prompt: política + contexto + documentos (sistema); mensajes (usuario).
  const system = buildSystem(ctx, selection)
  const messages = buildMessages(history, question)

  // 6. Modelo (sin streaming en v1: el filtro corta antes de mostrar).
  let result
  try {
    result = await complete({ system, messages, maxTokens: ASSISTANT_LIMITS.maxOutputTokens })
  } catch (err) {
    console.error('[assistant] error del proveedor:', err)
    return finish(fixedReply('error'), 'error', { docs: selection.ids })
  }
  const usage = {
    docs: selection.ids,
    model: result.model,
    costUsd: result.costUsd,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    cacheReadTokens: result.cacheReadTokens,
    cacheWriteTokens: result.cacheWriteTokens,
  }
  if (result.refused) return finish(fixedReply('fuera_de_alcance'), 'rechazo_modelo', usage)
  if (!result.text) return finish(fixedReply('error'), 'error', usage)

  // 7. Filtro de salida.
  const out = checkOutput(result.text)
  if (out.block) return finish(fixedReply(out.kind!), 'salida', usage)

  // 8. Respuesta + bitácora.
  return finish(result.text, null, usage)
}
