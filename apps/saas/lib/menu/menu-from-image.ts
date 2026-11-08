/**
 * lib/menu/menu-from-image.ts — carta completa desde una foto o PDF (plan Élite).
 *
 * Claude lee la carta y devuelve el formato JSON de carta v1
 * (lib/provisioning/menu-json.ts). El servidor lo valida con el mismo esquema
 * que la importación manual: nada se aplica sin la vista previa y la
 * confirmación del usuario.
 *
 * Mismo modelo y mismo manejo de errores que la lectura de precios
 * (lib/menu/price-image.ts).
 */
import Anthropic from '@anthropic-ai/sdk'
import { PRICE_IMAGE_MODEL, PriceImageError, type AllowedMedia } from '@/lib/menu/price-image'
import { parseMenuJson, type MenuJson, type MenuJsonStats } from '@/lib/provisioning/menu-json'

const ITEM = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'description', 'price', 'tags'],
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    price: { type: 'number' },
    tags: { type: 'array', items: { type: 'string' } },
  },
} as const

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'categories'],
  properties: {
    version: { type: 'number' },
    categories: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description', 'items', 'subcategories'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          items: { type: 'array', items: ITEM },
          subcategories: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'description', 'items'],
              properties: { name: { type: 'string' }, description: { type: 'string' }, items: { type: 'array', items: ITEM } },
            },
          },
        },
      },
    },
  },
} as const

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 2 })
  return client
}

/** Solo para tests. */
export function __setMenuImageClientForTests(c: unknown): void {
  client = c as Anthropic | null
}

export async function menuFromImage(data: string, mediaType: AllowedMedia): Promise<{ menu: MenuJson; stats: MenuJsonStats; model: string }> {
  if (!process.env.ANTHROPIC_API_KEY?.trim() && !client) throw new PriceImageError(503, 'La lectura de cartas con IA no está configurada.')
  const source = mediaType === 'application/pdf'
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType as Exclude<AllowedMedia, 'application/pdf'>, data } }

  const response = await getClient().beta.messages.create({
    model: PRICE_IMAGE_MODEL,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
    system:
      'Sos un asistente que transcribe cartas de restaurantes argentinos a datos. Leé la carta de la imagen y devolvé sus secciones y productos tal como aparecen, en el mismo orden. ' +
      'Precios en pesos como número sin puntos (12.000 = 12000). Si un plato tiene precio por porción y por fuente o por cantidad, usá el de la porción o unidad. ' +
      'Si un precio no se lee, poné 0. No inventes productos, descripciones ni precios: la descripción va vacía si la carta no la trae. ' +
      'Usá subcategorías solo cuando la carta tiene subsecciones claras dentro de una sección. version siempre 1.',
    messages: [{ role: 'user', content: [source, { type: 'text', text: 'Transcribí esta carta al formato pedido.' }] }],
  })

  if (response.stop_reason === 'refusal') throw new PriceImageError(422, 'No se pudo leer esta imagen. Probá con otra foto.')
  if (response.stop_reason === 'max_tokens') throw new PriceImageError(422, 'La carta es muy larga para leerla de una vez. Subila en partes.')
  const text = response.content.map(b => (b.type === 'text' ? b.text : '')).join('')
  const parsed = parseMenuJson(text)
  if (!parsed.ok) throw new PriceImageError(502, `No se pudo interpretar la lectura de la carta: ${parsed.error}`)
  return { menu: parsed.menu, stats: parsed.stats, model: response.model ?? PRICE_IMAGE_MODEL }
}
