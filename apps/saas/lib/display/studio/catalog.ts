// ============================================================================
// Display Studio — catálogo de plantillas (plan: apps/display/PLAN-STUDIO.md)
// ============================================================================
// Plantillas de diseño con campos editables (no es un editor libre): el
// comercio sube su foto, escribe sus textos, elige colores, logo y
// tipografía. El catálogo vive en el código (el diseño es código del
// reproductor: una sola fuente de verdad); las compras de las Premium van a
// DisplayTemplatePurchase. Se publican como piezas normales de pantalla
// (AppStory, screenTemplate kind 'studio').
// Este archivo NO importa nada del servidor: lo usan el panel y la API.
// ============================================================================

import { z } from 'zod'

export type StudioTier = 'free' | 'premium'
export type StudioFieldType = 'image' | 'text' | 'price' | 'color' | 'toggle' | 'font'

export interface StudioField {
  key: string
  type: StudioFieldType
  label: string
  /** Ayuda corta debajo del campo. */
  hint?: string
  required?: boolean
  /** text: largo máximo. */
  max?: number
  /** Agrupa los campos en el editor. */
  group: 'Marca' | 'Textos' | 'Imagen' | 'Precio' | 'Estilo' | 'Pie'
  default?: string | number | boolean | null
}

export interface StudioTemplate {
  id: StudioTemplateId
  name: string
  description: string
  category: 'promo' | 'destacado' | 'combo' | 'lanzamiento'
  tier: StudioTier
  /** Premium: precio de lista en dólares (se cobra en pesos al cambio del día). */
  priceUsd: number | null
  orientations: Array<'portrait' | 'landscape'>
  fields: StudioField[]
}

export type StudioTemplateId = 'golden-bites' | 'cheese-burger' | 'chocolate-croissant'

/** Tipografías curadas (Google Fonts; viajan como archivo y se guardan en el equipo). 'brand' = la de la marca. */
export const STUDIO_FONTS = [
  'brand', 'Archivo Black', 'Anton', 'Bebas Neue', 'Oswald', 'Montserrat', 'Poppins', 'Inter',
  'Playfair Display', 'DM Serif Display', 'Pacifico', 'Dancing Script', 'Lobster',
] as const
export type StudioFont = (typeof STUDIO_FONTS)[number]

const brandFields = (def: { name?: string } = {}): StudioField[] => [
  { key: 'showLogo', type: 'toggle', label: 'Mostrar logo', group: 'Marca', default: true },
  { key: 'brandName', type: 'text', label: 'Nombre del local', hint: 'Vacío = el nombre de tu comercio', max: 30, group: 'Marca', default: def.name ?? '' },
]
const qrField: StudioField = { key: 'showQr', type: 'toggle', label: 'QR para pedir desde el celular', group: 'Pie', default: true }

export const STUDIO_TEMPLATES: StudioTemplate[] = [
  {
    id: 'golden-bites',
    name: 'Golden Bites',
    description: 'Título enorme, producto sobre un arco de color y banda inferior con descuento, horario y QR. Para promos, destacados y combos.',
    category: 'promo',
    tier: 'free',
    priceUsd: null,
    orientations: ['portrait', 'landscape'],
    fields: [
      ...brandFields(),
      { key: 'website', type: 'text', label: 'Web o Instagram', max: 40, group: 'Marca', default: '' },
      { key: 'title1', type: 'text', label: 'Título (línea 1)', max: 16, required: true, group: 'Textos', default: 'Golden' },
      { key: 'title2', type: 'text', label: 'Título (línea 2)', max: 16, group: 'Textos', default: 'Bites' },
      { key: 'subtitle', type: 'text', label: 'Bajada', max: 120, group: 'Textos', default: 'Ingredientes frescos, recetas caseras y bebidas bien frías, todos los días.' },
      { key: 'image', type: 'image', label: 'Foto principal', hint: 'Mejor sin fondo (PNG recortado)', required: true, group: 'Imagen' },
      { key: 'image2', type: 'image', label: 'Foto secundaria (atrás)', hint: 'Opcional: bebida, papas…', group: 'Imagen' },
      { key: 'dealLabel', type: 'text', label: 'Etiqueta del descuento', max: 24, group: 'Precio', default: 'Descuento hasta' },
      { key: 'dealValue', type: 'text', label: 'Descuento o precio', hint: 'Ej.: 25% o $ 9.900', max: 10, group: 'Precio', default: '25%' },
      { key: 'hoursTitle', type: 'text', label: 'Título del horario', max: 28, group: 'Pie', default: 'Abierto todos los días' },
      { key: 'hours', type: 'text', label: 'Horario', max: 20, group: 'Pie', default: '08:00 - 22:00' },
      { key: 'hoursText', type: 'text', label: 'Texto del horario', max: 60, group: 'Pie', default: 'Vení este finde y disfrutá cada bocado.' },
      { key: 'ctaTitle', type: 'text', label: 'Texto junto al QR', max: 30, group: 'Pie', default: 'Pedí online' },
      qrField,
      { key: 'accent', type: 'color', label: 'Color de acento', hint: 'Vacío = el color de tu marca', group: 'Estilo', default: '#e3342f' },
      { key: 'background', type: 'color', label: 'Color de fondo', group: 'Estilo', default: '#f7efe4' },
      { key: 'textColor', type: 'color', label: 'Color del texto', group: 'Estilo', default: '#1d1d1b' },
      { key: 'font', type: 'font', label: 'Tipografía del título', group: 'Estilo', default: 'Archivo Black' },
    ],
  },
  {
    id: 'cheese-burger',
    name: 'Cheese Burger',
    description: 'Fondo plano de color, la palabra gigante en marquesina saliendo de los bordes y el producto encima. Máximo impacto.',
    category: 'destacado',
    tier: 'premium',
    priceUsd: 10,
    orientations: ['portrait', 'landscape'],
    fields: [
      ...brandFields(),
      { key: 'word1', type: 'text', label: 'Palabra 1', max: 12, required: true, group: 'Textos', default: 'Cheese' },
      { key: 'word2', type: 'text', label: 'Palabra 2', max: 12, group: 'Textos', default: 'Burger' },
      { key: 'image', type: 'image', label: 'Foto principal', hint: 'Mejor sin fondo (PNG recortado)', required: true, group: 'Imagen' },
      { key: 'showMini', type: 'toggle', label: 'Mini productos en las esquinas', group: 'Imagen', default: true },
      { key: 'text1', type: 'text', label: 'Texto 1', max: 22, group: 'Pie', default: 'Hasta 30% off' },
      { key: 'text1b', type: 'text', label: 'Texto 1 (abajo)', max: 22, group: 'Pie', default: 'No te lo pierdas' },
      { key: 'text2', type: 'text', label: 'Texto 2', max: 22, group: 'Pie', default: 'Tiempo limitado' },
      { key: 'text3', type: 'text', label: 'Texto 3', max: 28, group: 'Pie', default: 'En todas nuestras burgers' },
      { key: 'text3b', type: 'text', label: 'Texto 3 (abajo)', max: 22, group: 'Pie', default: 'Pedí ya' },
      { key: 'price', type: 'price', label: 'Precio (opcional)', group: 'Precio', default: null },
      qrField,
      { key: 'background', type: 'color', label: 'Color de fondo', hint: 'Vacío = el color de tu marca', group: 'Estilo', default: '#ff7a00' },
      { key: 'textColor', type: 'color', label: 'Color de la palabra gigante', group: 'Estilo', default: '#ffffff' },
      { key: 'font', type: 'font', label: 'Tipografía', group: 'Estilo', default: 'Anton' },
    ],
  },
  {
    id: 'chocolate-croissant',
    name: 'Chocolate Croissant',
    description: 'Estética de pastelería: título serif + manuscrita, trazos que se dibujan solos, sello «recién horneado» y lema.',
    category: 'lanzamiento',
    tier: 'premium',
    priceUsd: 10,
    orientations: ['portrait', 'landscape'],
    fields: [
      ...brandFields(),
      { key: 'word1', type: 'text', label: 'Título (serif)', max: 14, required: true, group: 'Textos', default: 'Chocolate' },
      { key: 'word2', type: 'text', label: 'Título (manuscrita)', max: 16, group: 'Textos', default: 'Croissant' },
      { key: 'tagline', type: 'text', label: 'Lema', max: 40, group: 'Textos', default: 'Capas crocantes, momentos dulces' },
      { key: 'image', type: 'image', label: 'Foto principal', hint: 'Sin fondo queda mejor; con fondo va en un círculo', required: true, group: 'Imagen' },
      { key: 'showStamp', type: 'toggle', label: 'Sello circular', group: 'Textos', default: true },
      { key: 'stampText', type: 'text', label: 'Texto del sello', max: 20, group: 'Textos', default: 'Recién horneado' },
      { key: 'price', type: 'price', label: 'Precio (opcional)', group: 'Precio', default: null },
      qrField,
      { key: 'accent', type: 'color', label: 'Color de acento', hint: 'Vacío = el color de tu marca', group: 'Estilo', default: '#c06a3a' },
      { key: 'textColor', type: 'color', label: 'Color del título', group: 'Estilo', default: '#5b2a12' },
      { key: 'background', type: 'color', label: 'Color de fondo', group: 'Estilo', default: '#f8ecdf' },
      { key: 'font', type: 'font', label: 'Tipografía serif', group: 'Estilo', default: 'Playfair Display' },
      { key: 'scriptFont', type: 'font', label: 'Tipografía manuscrita', group: 'Estilo', default: 'Pacifico' },
    ],
  },
]

export const studioTemplate = (id: string): StudioTemplate | null => STUDIO_TEMPLATES.find((t) => t.id === id) ?? null

/** Clave hermana de cada imagen: true si la foto subida tiene transparencia (recortada). */
export const cutoutKey = (imageKey: string) => `${imageKey}Cutout`

/** Valores por defecto de una plantilla (para el editor). */
export function studioDefaults(t: StudioTemplate): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of t.fields) {
    out[f.key] = f.default ?? (f.type === 'toggle' ? false : f.type === 'price' ? null : '')
    if (f.type === 'image') out[cutoutKey(f.key)] = false
  }
  return out
}

const HEX = /^#[0-9a-fA-F]{6}$/
function fieldSchema(f: StudioField): z.ZodTypeAny {
  switch (f.type) {
    case 'image': return f.required
      ? z.string({ error: `Subí «${f.label}»` }).url(`Subí «${f.label}»`).max(600)
      : z.string().url().max(600).or(z.literal('')).default('')
    case 'text': return f.required
      ? z.string().trim().min(1, `Completá «${f.label}»`).max(f.max ?? 80, `«${f.label}» es muy largo`)
      : z.string().trim().max(f.max ?? 80, `«${f.label}» es muy largo`).default(String(f.default ?? ''))
    case 'price': return z.number().int().min(0).max(1_000_000_000).nullable().default(null)
    case 'color': return z.string().regex(HEX, `Color inválido en «${f.label}»`).or(z.literal('')).default(String(f.default ?? ''))
    case 'toggle': return z.boolean().default(Boolean(f.default))
    case 'font': return z.enum(STUDIO_FONTS).default((f.default as StudioFont) ?? 'brand')
  }
}

/** Valida los valores contra los campos de la plantilla (lo que sobra se descarta). */
export function studioValuesSchema(t: StudioTemplate) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const f of t.fields) {
    shape[f.key] = fieldSchema(f)
    if (f.type === 'image') shape[cutoutKey(f.key)] = z.boolean().default(false)
  }
  return z.object(shape)
}

export const studioConfigSchema = z.object({
  templateId: z.string().refine((id) => !!studioTemplate(id), 'Plantilla inválida'),
  orientation: z.enum(['landscape', 'portrait']).default('portrait'),
  designWidth: z.number().int().min(480).max(3840).default(1080),
  designHeight: z.number().int().min(480).max(3840).default(1920),
  viewing: z.enum(['near', 'far']).default('near'),
  pageSeconds: z.number().int().min(5).max(60).default(12),
  values: z.record(z.string(), z.unknown()).default({}),
}).superRefine((c, ctx) => {
  if ((c.orientation === 'portrait') !== (c.designHeight > c.designWidth)) ctx.addIssue({ code: 'custom', path: ['designWidth'], message: 'El tamaño no coincide con la orientación' })
  const t = studioTemplate(c.templateId)
  if (!t) return
  if (!t.orientations.includes(c.orientation)) ctx.addIssue({ code: 'custom', path: ['orientation'], message: 'Esta plantilla no admite esa orientación' })
  const r = studioValuesSchema(t).safeParse(c.values)
  if (!r.success) ctx.addIssue({ code: 'custom', path: ['values'], message: r.error.issues[0]?.message ?? 'Valores inválidos' })
})
export type StudioConfig = z.infer<typeof studioConfigSchema>
export type ParsedStudioConfig = StudioConfig & { values: Record<string, unknown> }

/** Config guardada → normalizada (valores validados y con defaults), o null si está rota. */
export function parseStudioConfig(raw: unknown): ParsedStudioConfig | null {
  const r = studioConfigSchema.safeParse(raw ?? {})
  if (!r.success) return null
  const t = studioTemplate(r.data.templateId)!
  const v = studioValuesSchema(t).safeParse(r.data.values)
  return v.success ? { ...r.data, values: v.data as Record<string, unknown> } : null
}

/** URLs de imágenes subidas por el comercio (para validar que sean suyas y marcarlas como guardadas). */
export function studioImageUrls(c: { templateId: string; values: Record<string, unknown> }): string[] {
  const t = studioTemplate(c.templateId)
  if (!t) return []
  return t.fields.filter((f) => f.type === 'image').map((f) => c.values[f.key]).filter((u): u is string => typeof u === 'string' && u.length > 0)
}

/** Familias de Google elegidas en la pieza (las que no son 'brand'). */
export function studioFontFamilies(c: { templateId: string; values: Record<string, unknown> }): string[] {
  const t = studioTemplate(c.templateId)
  if (!t) return []
  return [...new Set(t.fields.filter((f) => f.type === 'font').map((f) => c.values[f.key]).filter((x): x is string => typeof x === 'string' && x !== 'brand'))]
}

/**
 * Valores para la VISTA PREVIA (todavía sin terminar): campo por campo, lo
 * válido se usa y lo inválido o vacío cae al valor por defecto. Nunca falla.
 */
export function studioPreviewValues(t: StudioTemplate, raw: Record<string, unknown>): Record<string, unknown> {
  const out = studioDefaults(t)
  for (const f of t.fields) {
    const r = fieldSchema({ ...f, required: false }).safeParse(raw[f.key])
    if (r.success && r.data !== undefined) out[f.key] = r.data
    if (f.type === 'image') out[cutoutKey(f.key)] = raw[cutoutKey(f.key)] === true
  }
  return out
}
