// ============================================================================
// Composiciones (Élite) — esquemas de configuración (23/11/2026)
// ============================================================================
// Lo que se guarda en AppStory.screenTemplate.config cuando kind ===
// 'composition': una pantalla armada con módulos. Archivo aparte (sin
// importar templates.ts) para evitar una importación circular.
//
// v2 (tótems): orientación y tamaño de diseño reales (el reproductor dibuja en
// ese lienzo y lo escala a la pantalla sin deformar), animaciones declarativas
// por módulo (GSAP en el reproductor) y transición entre páginas. Todo con
// valores por defecto: las composiciones guardadas antes siguen valiendo.
// ============================================================================

import { z } from 'zod'
import mongoose from 'mongoose'

const OID = (v: string) => mongoose.Types.ObjectId.isValid(v)
const channel = z.enum(['dine-in', 'takeaway']).default('dine-in')

export const COMPOSITION_STYLES = ['brand', 'dark', 'light'] as const

export const MODULE_TYPES = ['brand-header', 'hero-product', 'product-grid', 'combo-highlight', 'promo-banner', 'drinks-row', 'price-list', 'illustration-block', 'qr-cta'] as const
export type ModuleType = (typeof MODULE_TYPES)[number]

// ── Animaciones (las interpreta el reproductor con GSAP) ────────────────────
/** 'auto' = la recomendada para ese módulo; 'none' = aparece sin animación. */
export const ANIM_ENTERS = ['auto', 'none', 'fade', 'fadeUp', 'scaleIn', 'slideLeft', 'slideRight', 'stagger'] as const
export const ANIM_EASES = ['power3.out', 'power2.out', 'expo.out', 'back.out(1.7)', 'sine.out'] as const
export const animationSchema = z.object({
  enter: z.enum(ANIM_ENTERS).default('auto'),
  duration: z.number().min(0.2).max(3).default(0.8),
  /** Segundos de espera extra antes de este módulo (la página se arma en secuencia). */
  delay: z.number().min(0).max(5).default(0),
  ease: z.enum(ANIM_EASES).default('power3.out'),
  /** Entre ítems de listas y grillas. */
  stagger: z.number().min(0).max(0.5).default(0.08),
})
export type ModuleAnimation = z.infer<typeof animationSchema>
const anim = animationSchema.optional()

export const PAGE_TRANSITIONS = ['fade', 'slide', 'zoom', 'none'] as const

// ── Lienzo de diseño ────────────────────────────────────────────────────────
export const DESIGN_PRESETS = [
  { id: 'tv-1080', label: 'TV horizontal 1920 × 1080', orientation: 'landscape', width: 1920, height: 1080 },
  { id: 'tv-720', label: 'TV horizontal 1280 × 720', orientation: 'landscape', width: 1280, height: 720 },
  { id: 'totem-1080', label: 'Tótem vertical 1080 × 1920', orientation: 'portrait', width: 1080, height: 1920 },
  { id: 'totem-720', label: 'Tótem vertical chico 720 × 1280', orientation: 'portrait', width: 720, height: 1280 },
] as const

// Módulos sin nada obligatorio aceptan config vacía o ausente: Mongo borra los objetos vacíos al guardar.
export const moduleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('brand-header'), animation: anim, config: z.object({ tagline: z.string().trim().max(80).default(''), showLogo: z.boolean().default(true) }).default({ tagline: '', showLogo: true }) }),
  z.object({ type: z.literal('hero-product'), animation: anim, config: z.object({ productId: z.string().refine(OID, 'Producto inválido'), priceChannel: channel, badge: z.string().trim().max(30).default(''), kenBurns: z.boolean().default(true), showDiscount: z.boolean().default(true) }) }),
  z.object({ type: z.literal('product-grid'), animation: anim, config: z.object({ productIds: z.array(z.string().refine(OID, 'Producto inválido')).min(1, 'Elegí al menos un producto').max(8), priceChannel: channel, showDescriptions: z.boolean().default(false) }) }),
  z.object({ type: z.literal('combo-highlight'), animation: anim, config: z.object({ comboId: z.string().refine(OID, 'Combo inválido'), badge: z.string().trim().max(30).default(''), kenBurns: z.boolean().default(false) }) }),
  z.object({ type: z.literal('promo-banner'), animation: anim, config: z.object({ promotionId: z.string().refine(OID, 'Promo inválida'), headline: z.string().trim().max(60).default(''), kenBurns: z.boolean().default(true), showDiscount: z.boolean().default(true) }) }),
  z.object({ type: z.literal('drinks-row'), animation: anim, config: z.object({ productIds: z.array(z.string().refine(OID, 'Producto inválido')).min(1, 'Elegí al menos una bebida').max(10), priceChannel: channel }) }),
  z.object({ type: z.literal('price-list'), animation: anim, config: z.object({ categoryIds: z.array(z.string().refine(OID, 'Categoría inválida')).min(1, 'Elegí al menos una categoría').max(10), priceChannel: channel, showSubcategories: z.boolean().default(true) }) }),
  z.object({ type: z.literal('illustration-block'), animation: anim, config: z.object({ imageUrl: z.string().url().max(600), text: z.string().trim().max(120).default(''), imagePosition: z.enum(['left', 'right', 'top', 'bottom']).default('left'), kenBurns: z.boolean().default(false) }) }),
  z.object({ type: z.literal('qr-cta'), animation: anim, config: z.object({ headline: z.string().trim().max(60).default('Pedí desde tu celular'), subtext: z.string().trim().max(80).default('Escaneá el QR y hacé tu pedido') }).default({ headline: 'Pedí desde tu celular', subtext: 'Escaneá el QR y hacé tu pedido' }) }),
])
export type CompositionModule = z.infer<typeof moduleSchema>

export const compositionConfigSchema = z.object({
  style: z.enum(COMPOSITION_STYLES).default('brand'),
  /** Segundos por página (si los módulos no entran en una, se reparten en varias). */
  pageSeconds: z.number().int().min(5).max(30).default(10),
  /** QR global (en el encabezado o en una esquina) si no hay un módulo «QR para pedir». */
  showQr: z.boolean().default(true),
  /** Lienzo de diseño: se dibuja en este tamaño y se escala a la pantalla sin deformar. */
  orientation: z.enum(['landscape', 'portrait']).default('landscape'),
  designWidth: z.number().int().min(480).max(3840).default(1920),
  designHeight: z.number().int().min(480).max(3840).default(1080),
  targetDevices: z.array(z.enum(['tv', 'totem', 'tablet'])).max(3).optional(),
  transition: z.enum(PAGE_TRANSITIONS).default('fade'),
  /** Distancia de lectura: 'far' (exterior, vidriera, tótem de pie) agranda todo el contenido. */
  viewing: z.enum(['near', 'far']).default('near'),
  modules: z.array(moduleSchema).min(1, 'Agregá al menos un módulo').max(12),
}).superRefine((c, ctx) => {
  const portrait = c.designHeight > c.designWidth
  if ((c.orientation === 'portrait') !== portrait) {
    ctx.addIssue({ code: 'custom', path: ['designWidth'], message: c.orientation === 'portrait' ? 'Una composición vertical tiene que ser más alta que ancha' : 'Una composición horizontal tiene que ser más ancha que alta' })
  }
})
export type CompositionConfig = z.infer<typeof compositionConfigSchema>

/** Config guardada → válida, o null si está rota (el manifiesto nunca se cae por una pieza). */
export function parseCompositionConfig(raw: unknown): CompositionConfig | null {
  // Composiciones guardadas antes del lienzo: sin tamaño → el de su orientación.
  const r0 = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const fixed = r0.designWidth || r0.designHeight || r0.orientation !== 'portrait' ? r0 : { ...r0, designWidth: 1080, designHeight: 1920 }
  const r = compositionConfigSchema.safeParse(fixed)
  return r.success ? r.data : null
}

/** URLs de ilustraciones (para validar que sean del comercio y marcarlas como guardadas). */
export function illustrationUrls(config: CompositionConfig): string[] {
  return config.modules.flatMap((m) => (m.type === 'illustration-block' ? [m.config.imageUrl] : []))
}
