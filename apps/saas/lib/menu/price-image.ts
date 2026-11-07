/**
 * lib/menu/price-image.ts — precios nuevos desde una foto o PDF de la carta.
 *
 * Claude lee la imagen y, con la lista de platos de la carta actual, devuelve
 * (en un JSON con esquema fijo) el precio nuevo de cada plato reconocido y los
 * platos de la imagen que no encontró. El servidor valida todo: solo acepta
 * claves de platos que existen y precios positivos razonables. El resultado
 * son ajustes a mano para la vista previa: nada se aplica sin revisar.
 *
 * Modelo: Claude Opus 5.5 (PRICE_IMAGE_MODEL lo cambia). Con fallbacks del
 * servidor ("default") por si el pedido se rechaza. Sin ANTHROPIC_API_KEY la
 * función avisa que no está disponible.
 */
import Anthropic from '@anthropic-ai/sdk'
import { flattenMenus, type MenuLike, type PriceOverride } from './price-engine'

export const PRICE_IMAGE_MODEL = process.env.PRICE_IMAGE_MODEL?.trim() || 'claude-opus-5-5'
export const ALLOWED_MEDIA = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'] as const
export type AllowedMedia = (typeof ALLOWED_MEDIA)[number]

export interface ImagePriceResult {
  overrides: Record<string, PriceOverride>
  matched: { itemKey: string; itemName: string; categoryName: string; price: number }[]
  missing: { name: string; price: number | null; category: string | null }[]
  model: string
}

export class PriceImageError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['matches', 'missing'],
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'price'],
        properties: {
          id: { type: 'integer', description: 'Número del plato en la lista de la carta actual.' },
          price: { type: 'number', description: 'Precio en pesos que figura en la imagen (sin $ ni puntos de miles).' },
          takeawayPrice: { type: ['number', 'null'], description: 'Precio para llevar si la imagen lo distingue; si no, null.' },
        },
      },
    },
    missing: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'price', 'category'],
        properties: {
          name: { type: 'string' },
          price: { type: ['number', 'null'] },
          category: { type: ['string', 'null'] },
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
export function __setPriceImageClientForTests(c: unknown): void {
  client = c as Anthropic | null
}

export async function pricesFromImage(menu: MenuLike, data: string, mediaType: AllowedMedia): Promise<ImagePriceResult> {
  if (!process.env.ANTHROPIC_API_KEY?.trim() && !client) throw new PriceImageError(503, 'La lectura de cartas con IA no está configurada.')
  const items = flattenMenus([menu])
  const list = items.map((f, i) => `${i + 1}. [${f.categoryName}${f.subcategoryName ? ' > ' + f.subcategoryName : ''}] ${f.item.name} — hoy $${Math.round(Number(f.item.price ?? 0) / 100)}`).join('\n')

  const source = mediaType === 'application/pdf'
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType as Exclude<AllowedMedia, 'application/pdf'>, data } }

  const response = await getClient().beta.messages.create({
    model: PRICE_IMAGE_MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
    system:
      'Sos un asistente que lee cartas de restaurantes argentinos. Te paso la imagen de la carta NUEVA y la lista numerada de platos de la carta ACTUAL del sistema. ' +
      'Para cada plato de la imagen que corresponda claramente a un plato de la lista, devolvé su número y el precio de la imagen en pesos (12.000 = 12000). ' +
      'Si un plato tiene dos precios por cantidad (por ejemplo «2 platos / 1 plato»), usá el precio de 1 plato o porción. ' +
      'No adivines: si no estás seguro de a qué plato de la lista corresponde, ponelo en «missing». ' +
      'En «missing» poné los platos de la imagen que no están en la lista, con su precio y la sección de la carta.',
    messages: [{
      role: 'user',
      content: [source, { type: 'text', text: `Carta actual del sistema:\n${list}` }],
    }],
  })

  if (response.stop_reason === 'refusal') throw new PriceImageError(422, 'No se pudo leer esta imagen. Probá con otra foto o con la planilla.')
  if (response.stop_reason === 'max_tokens') throw new PriceImageError(422, 'La carta es muy larga para leerla de una vez. Subila en partes.')
  const text = response.content.map(b => (b.type === 'text' ? b.text : '')).join('')
  let parsed: { matches?: { id?: unknown; price?: unknown; takeawayPrice?: unknown }[]; missing?: { name?: unknown; price?: unknown; category?: unknown }[] }
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new PriceImageError(502, 'No se pudo interpretar la lectura de la carta. Probá de nuevo.')
  }

  const pesosToCents = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 100_000_000 ? Math.round(v * 100) : null)
  const overrides: Record<string, PriceOverride> = {}
  const matched: ImagePriceResult['matched'] = []
  for (const m of parsed.matches ?? []) {
    const idx = typeof m.id === 'number' ? m.id - 1 : -1
    const f = items[idx]
    const price = pesosToCents(m.price)
    if (!f || price == null || overrides[f.key]) continue
    const takeaway = pesosToCents(m.takeawayPrice)
    overrides[f.key] = { price, ...(takeaway != null ? { takeawayPrice: takeaway } : {}) }
    matched.push({ itemKey: f.key, itemName: f.item.name, categoryName: f.categoryName, price })
  }
  const missing = (parsed.missing ?? [])
    .filter(x => typeof x.name === 'string' && x.name.trim())
    .slice(0, 100)
    .map(x => ({ name: String(x.name).slice(0, 120), price: pesosToCents(x.price), category: typeof x.category === 'string' ? x.category.slice(0, 80) : null }))
  return { overrides, matched, missing, model: response.model ?? PRICE_IMAGE_MODEL }
}
