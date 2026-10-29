import Anthropic from '@anthropic-ai/sdk'

// ============================================================================
// TEO — cliente del modelo (harness: ÚNICO archivo que conoce al proveedor)
// ============================================================================
// Cambiar de proveedor o de modelo es tocar este archivo (o ASSISTANT_MODEL).
// v1 sin streaming: el filtro de salida corta ANTES de mostrar (decisión del
// diseño). Sin ANTHROPIC_API_KEY el asistente queda «próximamente» y no gasta.
// ============================================================================

export interface LlmSystemBlock {
  text: string
  /** Bloque estable: se marca para prompt caching. */
  cache: boolean
}

export interface LlmMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LlmResult {
  text: string
  model: string
  refused: boolean
  truncated: boolean
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number
}

export const DEFAULT_MODEL = 'claude-haiku-5-5'

/** USD por millón de tokens (precios de API de Anthropic). */
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
}

export function assistantModel(): string {
  return process.env.ASSISTANT_MODEL?.trim() || DEFAULT_MODEL
}

export function isLlmConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
}

/** Costo estimado: lectura de caché ≈ 0,1× y escritura ≈ 1,25× del precio de entrada. */
export function estimateCostUsd(
  model: string,
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number }
): number {
  const p = PRICING[model] ?? PRICING[DEFAULT_MODEL]
  const usd =
    (usage.input * p.input + usage.cacheRead * p.input * 0.1 + usage.cacheWrite * p.input * 1.25 + usage.output * p.output) /
    1_000_000
  return Math.round(usd * 1_000_000) / 1_000_000
}

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 30_000, maxRetries: 2 })
  return client
}

/** Solo para tests. */
export function __setLlmClientForTests(c: unknown): void {
  client = c as Anthropic | null
}

export async function complete(input: {
  system: LlmSystemBlock[]
  messages: LlmMessage[]
  maxTokens: number
}): Promise<LlmResult> {
  const model = assistantModel()
  const response = await getClient().messages.create({
    model,
    max_tokens: input.maxTokens,
    // Soporte de preguntas cortas: sin razonamiento extendido (permitido en
    // Haiku 5.5 con effort ≤ high) y esfuerzo bajo — respuestas rápidas y baratas.
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: input.system.map((b) =>
      b.cache ? { type: 'text' as const, text: b.text, cache_control: { type: 'ephemeral' as const } } : { type: 'text' as const, text: b.text }
    ),
    messages: input.messages,
  })

  const text = response.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim()
  const usage = {
    input: response.usage.input_tokens ?? 0,
    output: response.usage.output_tokens ?? 0,
    cacheRead: response.usage.cache_read_input_tokens ?? 0,
    cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
  }
  return {
    text,
    model: response.model ?? model,
    refused: response.stop_reason === 'refusal',
    truncated: response.stop_reason === 'max_tokens',
    inputTokens: usage.input,
    outputTokens: usage.output,
    cacheReadTokens: usage.cacheRead,
    cacheWriteTokens: usage.cacheWrite,
    costUsd: estimateCostUsd(model, usage),
  }
}
