// ============================================================================
// Composiciones (Élite) — esquemas de configuración (23/11/2026)
// ============================================================================
// Lo que se guarda en AppStory.screenTemplate.config cuando kind ===
// 'composition': una pantalla armada con módulos (encabezado, producto
// estrella, grilla, combo, promo, bebidas, lista de precios, ilustración y
// QR). Archivo aparte (sin importar templates.ts) para evitar una importación
// circular: templates.ts lo usa en su unión de plantillas.
// ============================================================================

import { z } from 'zod'
import mongoose from 'mongoose'

const OID = (v: string) => mongoose.Types.ObjectId.isValid(v)
const channel = z.enum(['dine-in', 'takeaway']).default('dine-in')

export const COMPOSITION_STYLES = ['brand', 'dark', 'light'] as const

export const MODULE_TYPES = ['brand-header', 'hero-product', 'product-grid', 'combo-highlight', 'promo-banner', 'drinks-row', 'price-list', 'illustration-block', 'qr-cta'] as const
export type ModuleType = (typeof MODULE_TYPES)[number]

export const moduleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('brand-header'), config: z.object({ tagline: z.string().trim().max(80).default(''), showLogo: z.boolean().default(true) }) }),
  z.object({ type: z.literal('hero-product'), config: z.object({ productId: z.string().refine(OID, 'Producto inválido'), priceChannel: channel, badge: z.string().trim().max(20).default('') }) }),
  z.object({ type: z.literal('product-grid'), config: z.object({ productIds: z.array(z.string().refine(OID, 'Producto inválido')).min(1, 'Elegí al menos un producto').max(8), priceChannel: channel, showDescriptions: z.boolean().default(false) }) }),
  z.object({ type: z.literal('combo-highlight'), config: z.object({ comboId: z.string().refine(OID, 'Combo inválido'), badge: z.string().trim().max(20).default('') }) }),
  z.object({ type: z.literal('promo-banner'), config: z.object({ promotionId: z.string().refine(OID, 'Promo inválida'), headline: z.string().trim().max(60).default('') }) }),
  z.object({ type: z.literal('drinks-row'), config: z.object({ productIds: z.array(z.string().refine(OID, 'Producto inválido')).min(1, 'Elegí al menos una bebida').max(10), priceChannel: channel }) }),
  z.object({ type: z.literal('price-list'), config: z.object({ categoryIds: z.array(z.string().refine(OID, 'Categoría inválida')).min(1, 'Elegí al menos una categoría').max(10), priceChannel: channel, showSubcategories: z.boolean().default(true) }) }),
  z.object({ type: z.literal('illustration-block'), config: z.object({ imageUrl: z.string().url().max(600), text: z.string().trim().max(120).default(''), imagePosition: z.enum(['left', 'right', 'top', 'bottom']).default('left') }) }),
  z.object({ type: z.literal('qr-cta'), config: z.object({ headline: z.string().trim().max(60).default('Pedí desde tu celular'), subtext: z.string().trim().max(80).default('Escaneá el QR y hacé tu pedido') }) }),
])
export type CompositionModule = z.infer<typeof moduleSchema>

export const compositionConfigSchema = z.object({
  style: z.enum(COMPOSITION_STYLES).default('brand'),
  pageSeconds: z.number().int().min(5).max(30).default(10),
  /** QR flotante global (si no hay un módulo qr-cta). */
  showQr: z.boolean().default(true),
  /** Tope de seguridad: en la práctica una composición tiene 3 a 5 módulos (una sola pantalla). */
  modules: z.array(moduleSchema).min(1, 'Agregá al menos un módulo').max(12),
})
export type CompositionConfig = z.infer<typeof compositionConfigSchema>

/** Config guardada → válida, o null si está rota (el manifiesto nunca se cae por una pieza). */
export function parseCompositionConfig(raw: unknown): CompositionConfig | null {
  const r = compositionConfigSchema.safeParse(raw ?? {})
  return r.success ? r.data : null
}

/** URLs de ilustraciones (para validar que sean del comercio y marcarlas como guardadas). */
export function illustrationUrls(config: CompositionConfig): string[] {
  return config.modules.flatMap((m) => (m.type === 'illustration-block' ? [m.config.imageUrl] : []))
}
