// ============================================================================
// Piezas automáticas de pantalla — Entrega 1: carta en pantalla (22/11/2026)
// ============================================================================
// Una pieza automática es un AppStory de pantalla con `screenTemplate`
// (sin archivo). Vive en la MISMA lista de reproducción que las piezas
// subidas: orden, sede, fechas, franja horaria y métricas son las mismas.
//
// Carta ('menu'): se arma al pedir el manifiesto con la carta de la sede del
// equipo (Menu), el logo y los colores del comercio (Tenant.branding). No se
// carga nada dos veces: precio, foto, disponibilidad y horario salen del
// catálogo. La pantalla recibe:
//  · cada producto con su estado ACTUAL (pausado manual o por stock) y los
//    horarios de disponibilidad de producto, subcategoría y categoría, para
//    evaluarlos sola, también sin internet;
//  · las fotos en un tamaño fijo para guardarlas en el equipo.
// Este archivo es puro (sin Mongo): se testea con datos armados a mano.
// ============================================================================

import { channelPrice } from '@takeasygo/business/browser'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import mongoose from 'mongoose'
import { compositionConfigSchema } from '@/lib/display/composition-schema'

const OID = (v: string) => mongoose.Types.ObjectId.isValid(v)

// ── Configuración (lo que elige el comercio) ────────────────────────────────

export const MENU_STYLES = ['brand', 'dark', 'light'] as const
export type MenuStyle = (typeof MENU_STYLES)[number]

export const menuConfigSchema = z.object({
  /** Categorías y orden. Vacío = todas, en el orden de la carta. */
  categoryIds: z.array(z.string().refine(OID, 'Categoría inválida')).max(40).default([]),
  style: z.enum(MENU_STYLES).default('brand'),
  showPhotos: z.boolean().default(true),
  showDescriptions: z.boolean().default(false),
  /** Qué precio se muestra: el de salón o el de retiro. */
  priceChannel: z.enum(['dine-in', 'takeaway']).default('dine-in'),
  /** Producto no disponible: desaparece o queda marcado «Agotado». */
  unavailable: z.enum(['hide', 'mark']).default('hide'),
  /** Segundos por página de productos. */
  pageSeconds: z.number().int().min(5).max(30).default(8),
  /** QR «Pedí desde tu celular» con atribución a esta pantalla. */
  showQr: z.boolean().default(true),
})
export type MenuConfig = z.infer<typeof menuConfigSchema>

// Entrega 2 · Promos por horario: las promociones del comercio, sin cargarlas dos veces.
export const promosConfigSchema = z.object({
  style: z.enum(MENU_STYLES).default('brand'),
  /** Cuántas promos como máximo por vuelta (las de la franja actual). */
  maxItems: z.number().int().min(1).max(12).default(6),
  showPrices: z.boolean().default(true),
  pageSeconds: z.number().int().min(5).max(30).default(8),
  showQr: z.boolean().default(true),
})
export type PromosConfig = z.infer<typeof promosConfigSchema>

// Entrega 3 · Lo más pedido y venta sugerida (lib/display/featured.ts).
export const featuredConfigSchema = z.object({
  style: z.enum(MENU_STYLES).default('brand'),
  /** Productos por vuelta (los primeros disponibles del ranking). */
  maxItems: z.number().int().min(3).max(12).default(6),
  includeCombos: z.boolean().default(true),
  priceChannel: z.enum(['dine-in', 'takeaway']).default('dine-in'),
  pageSeconds: z.number().int().min(5).max(30).default(10),
  showQr: z.boolean().default(true),
})
export type FeaturedConfig = z.infer<typeof featuredConfigSchema>

export const templateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('menu'), config: menuConfigSchema }),
  z.object({ kind: z.literal('promos'), config: promosConfigSchema }),
  z.object({ kind: z.literal('featured'), config: featuredConfigSchema }),
  // Élite · composiciones con módulos (lib/display/composition.ts). Conviven con las demás.
  z.object({ kind: z.literal('composition'), config: compositionConfigSchema }),
])
export type TemplateInput = z.infer<typeof templateSchema>

/** Plantillas que dependen de la carta de UNA sede (las demás pueden ir a todas las sedes). */
export const TEMPLATES_NEED_LOCATION = new Set(['menu', 'featured', 'composition'])

const HM = /^([01]\d|2[0-3]):[0-5]\d$/

export const createTemplatePieceSchema = z.object({
  title: z.string().trim().min(1, 'Poné un nombre').max(80),
  template: templateSchema,
  /** La carta es de una sede (cada sede tiene la suya); las promos pueden ir a todas (null). */
  locationId: z.string().refine(OID, 'Elegí la sede').nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  daypart: z.object({
    days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    from: z.string().regex(HM).nullable().optional(),
    to: z.string().regex(HM).nullable().optional(),
  }).refine((d) => (!d.from && !d.to) || (!!d.from && !!d.to), 'La franja necesita hora de inicio y de fin').nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
})

// ── Lo que recibe la pantalla ───────────────────────────────────────────────

export interface Slot { days: number[]; from: string; to: string }

export interface BoardProduct {
  id: string
  name: string
  description: string | null
  /** Centavos. Con variantes: el menor («desde»). */
  price: number
  fromPrice: boolean
  /** Centavos; solo si es mayor que el precio (precio tachado). */
  originalPrice: number | null
  image: string | null
  /** Estado actual: false = pausado (a mano o por stock). */
  available: boolean
  /** Horarios que tienen que cumplirse todos (categoría, subcategoría, producto). */
  schedules: Slot[][]
  featured: boolean
}

export interface BoardSection {
  id: string
  name: string
  /** Categoría madre, si la sección es una subcategoría. */
  parent: string | null
  products: BoardProduct[]
}

export interface BoardBrand {
  name: string
  logo: string | null
  primary: string
  background: string | null
  text: string | null
}

export interface MenuBoard {
  kind: 'menu'
  showQr: boolean
  style: MenuStyle
  showPhotos: boolean
  showDescriptions: boolean
  unavailable: 'hide' | 'mark'
  pageMs: number
  brand: BoardBrand
  sections: BoardSection[]
}

// ── Armado ──────────────────────────────────────────────────────────────────

export type AnyDoc = Record<string, any>

const HEX = /^#[0-9a-f]{6}$/i
const cleanColor = (c: unknown): string | null => (typeof c === 'string' && HEX.test(c.trim()) ? c.trim() : null)

/** Foto de Cloudinary recortada al tamaño de la pantalla (las de otros sitios quedan como están). */
export function boardImageUrl(url: unknown, w: number, h: number, mode: 'fill' | 'fit' = 'fill'): string | null {
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) return null
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/.exec(url)
  if (!m) return url
  const t = mode === 'fill' ? `c_fill,g_auto,w_${w},h_${h},q_auto,f_auto` : `c_fit,w_${w},h_${h},q_auto,f_auto`
  return `${m[1]}${t}/${m[2]}`
}

export function slotsOf(node: AnyDoc): Slot[] | null {
  if (node?.availabilityMode !== 'scheduled') return null
  const list = Array.isArray(node.availabilitySchedule) ? node.availabilitySchedule : []
  return list
    .filter((s: AnyDoc) => typeof s?.timeStart === 'string' && typeof s?.timeEnd === 'string' && HM.test(s.timeStart) && HM.test(s.timeEnd))
    .map((s: AnyDoc) => ({ days: (Array.isArray(s.days) ? s.days : []).filter((d: unknown) => Number.isInteger(d)), from: s.timeStart, to: s.timeEnd }))
}

export function priceOf(item: AnyDoc, channel: MenuConfig['priceChannel']): { price: number; fromPrice: boolean; originalPrice: number | null } {
  const disabled = new Set<string>(Array.isArray(item.disabledVariantNames) ? item.disabledVariantNames : [])
  const variants = (Array.isArray(item.variants) ? item.variants : []).filter((v: AnyDoc) => !disabled.has(v?.name))
  const pick = (n: AnyDoc) => channelPrice(n as never, channel === 'takeaway' ? 'takeaway' : 'dine-in')
  const pickOrig = (n: AnyDoc) => (channel === 'takeaway' ? (n.takeawayOriginalPrice ?? n.originalPrice) : n.originalPrice)
  if (variants.length) {
    type VP = { p: number; o: number }
    const prices: VP[] = variants.map((v: AnyDoc) => ({ p: Number(pick(v)) || 0, o: Number(pickOrig(v)) || 0 })).filter((x: VP) => x.p > 0)
    if (prices.length) {
      const min = prices.reduce((a, b) => (b.p < a.p ? b : a))
      return { price: min.p, fromPrice: prices.length > 1, originalPrice: min.o > min.p ? min.o : null }
    }
  }
  const p = Number(pick(item)) || 0
  const o = Number(pickOrig(item)) || 0
  return { price: p, fromPrice: false, originalPrice: o > p ? o : null }
}

/**
 * Carta de la sede → datos de la pantalla. Solo lo que el menú público ya
 * muestra: categorías ofrecidas, productos ofrecidos en el canal elegido.
 * Categoría apagada = no se ofrece (no aparece). Producto pausado = no
 * disponible (desaparece o «Agotado», según la configuración).
 */
export function buildMenuBoard(menu: AnyDoc | null, tenant: AnyDoc, config: MenuConfig): MenuBoard {
  const b = tenant?.branding ?? {}
  const brand: BoardBrand = {
    name: String(tenant?.name ?? ''),
    logo: boardImageUrl(b.logoUrl, 320, 160, 'fit'),
    primary: cleanColor(b.primaryColor) ?? '#E85D2A',
    background: cleanColor(b.backgroundColor),
    text: cleanColor(b.textColor),
  }
  const all: AnyDoc[] = (Array.isArray(menu?.categories) ? menu!.categories : [])
    .filter((c: AnyDoc) => c && c.isAvailable !== false)
  let cats: AnyDoc[]
  if (config.categoryIds.length) {
    const byId = new Map(all.map((c) => [String(c._id), c]))
    cats = config.categoryIds.map((id) => byId.get(id)).filter((c): c is AnyDoc => !!c)
  } else {
    cats = [...all].sort((a, c) => (a.sortOrder ?? 0) - (c.sortOrder ?? 0))
  }

  const offered = (item: AnyDoc) => item && (config.priceChannel !== 'takeaway' || item.isTakeawayAvailable !== false)
  const toProduct = (item: AnyDoc, inherited: Slot[][]): BoardProduct | null => {
    if (!offered(item)) return null
    const { price, fromPrice, originalPrice } = priceOf(item, config.priceChannel)
    if (!(price > 0)) return null
    const own = slotsOf(item)
    return {
      id: String(item._id),
      name: String(item.name ?? '').slice(0, 80),
      description: config.showDescriptions && item.description ? String(item.description).slice(0, 140) : null,
      price,
      fromPrice,
      originalPrice,
      image: config.showPhotos ? boardImageUrl(item.imageUrl, 480, 480) : null,
      available: item.isAvailable !== false,
      schedules: own ? [...inherited, own] : inherited,
      featured: !!item.isFeatured,
    }
  }

  const sections: BoardSection[] = []
  for (const c of cats) {
    const catSlots = slotsOf(c)
    const base = catSlots ? [catSlots] : []
    const direct = (c.items ?? []).map((i: AnyDoc) => toProduct(i, base)).filter((p: BoardProduct | null): p is BoardProduct => !!p)
    if (direct.length) sections.push({ id: String(c._id), name: String(c.name ?? ''), parent: null, products: direct })
    const subs = [...(c.subcategories ?? [])].sort((a: AnyDoc, z2: AnyDoc) => (a.sortOrder ?? 0) - (z2.sortOrder ?? 0))
    for (const s of subs) {
      const subSlots = slotsOf(s)
      const inh = subSlots ? [...base, subSlots] : base
      const prods = (s.items ?? []).map((i: AnyDoc) => toProduct(i, inh)).filter((p: BoardProduct | null): p is BoardProduct => !!p)
      if (prods.length) sections.push({ id: String(s._id), name: String(s.name ?? ''), parent: String(c.name ?? ''), products: prods })
    }
  }

  return {
    kind: 'menu',
    showQr: config.showQr,
    style: config.style,
    showPhotos: config.showPhotos,
    showDescriptions: config.showDescriptions,
    unavailable: config.unavailable,
    pageMs: config.pageSeconds * 1000,
    brand,
    sections,
  }
}

/** Archivos que la pantalla tiene que guardar para mostrar la carta sin internet. */
export function boardAssets(board: MenuBoard): string[] {
  const out = new Set<string>()
  if (board.brand.logo) out.add(board.brand.logo)
  for (const s of board.sections) for (const p of s.products) if (p.image) out.add(p.image)
  return [...out]
}

/** Huella del contenido: cambia el ETag del manifiesto cuando cambia un precio, una foto o una pausa. */
export function boardHash(board: object): string {
  return createHash('sha1').update(JSON.stringify(board)).digest('hex').slice(0, 16)
}

/** Duración estimada de una vuelta (la real la calcula la pantalla según lo disponible). */
export function estimateBoardMs(board: MenuBoard, perPage: number): number {
  const pages = board.sections.reduce((n, s) => n + Math.max(1, Math.ceil(s.products.length / perPage)), 0)
  return Math.max(1, pages) * board.pageMs
}

// ── Promos por horario ──────────────────────────────────────────────────────

export interface BoardPromo {
  id: string
  title: string
  text: string | null
  image: string | null
  /** Centavos (promo de precio fijo). */
  price: number | null
  originalPrice: number | null
  /** Promo de descuento: el mayor % de sus objetivos. */
  percent: number | null
  /** Ventana efectiva de fechas (ISO; una fecha sin hora vale el día entero en la sede). */
  startsAt: string | null
  endsAt: string | null
  /** Días 0–6 (vacío = todos) y franja «HH:MM» (from > to cruza la medianoche). */
  days: number[]
  from: string | null
  to: string | null
}

export interface PromoBoard {
  kind: 'promos'
  showQr: boolean
  style: MenuStyle
  showPrices: boolean
  maxItems: number
  pageMs: number
  brand: BoardBrand
  promos: BoardPromo[]
}

export function brandOf(tenant: AnyDoc): BoardBrand {
  const b = tenant?.branding ?? {}
  return {
    name: String(tenant?.name ?? ''),
    logo: boardImageUrl(b.logoUrl, 320, 160, 'fit'),
    primary: cleanColor(b.primaryColor) ?? '#E85D2A',
    background: cleanColor(b.backgroundColor),
    text: cleanColor(b.textColor),
  }
}

const HM_ANY = /^([01]?\d|2[0-3]):([0-5]\d)$/
const hm = (v: unknown): string | null => {
  const m = typeof v === 'string' ? HM_ANY.exec(v.trim()) : null
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}

/**
 * Promociones del comercio → datos de la pantalla. Las mismas que ya cargó en
 * Promociones: sin repetir nada. Se excluyen las de TakeasyGO (solo contenido
 * propio), las que solo valen para delivery, las agotadas (tope de canjes) y
 * las vencidas. La pantalla evalúa días, franja y fechas sola, también sin
 * internet; cuando una vence, se apaga sola.
 */
export function buildPromoBoard(
  promos: AnyDoc[],
  tenant: AnyDoc,
  config: PromosConfig,
  window: (start: unknown, end: unknown) => { start: Date | null; end: Date | null },
  percentOf: (p: AnyDoc) => number | null,
  now = new Date(),
): PromoBoard {
  const out: BoardPromo[] = []
  for (const p of promos) {
    if (!p || p.isActive === false) continue
    const channels: string[] = Array.isArray(p.channels) ? p.channels : []
    if (channels.length && channels.every((c) => c === 'delivery')) continue
    if (p.maxRedemptions && (p.redemptionsCount ?? 0) >= p.maxRedemptions) continue
    const w = window(p.scheduledStart, p.scheduledEnd)
    if (w.end && w.end.getTime() <= now.getTime()) continue
    const from = hm(p.activeTimeStart)
    const to = hm(p.activeTimeEnd)
    const isSale = p.type === 'sale'
    const price = isSale && Number(p.price) > 0 ? Number(p.price) : null
    const orig = isSale && Number(p.originalPrice) > (price ?? 0) ? Number(p.originalPrice) : null
    out.push({
      id: String(p._id),
      title: String(p.title ?? '').slice(0, 80),
      text: String(p.shortDescription || p.description || '').slice(0, 160) || null,
      image: boardImageUrl(p.imageUrl, 960, 960),
      price,
      originalPrice: orig,
      percent: p.type === 'discount' ? percentOf(p) : null,
      startsAt: w.start ? w.start.toISOString() : null,
      endsAt: w.end ? w.end.toISOString() : null,
      days: (Array.isArray(p.activeDays) ? p.activeDays : []).filter((d: unknown) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6),
      from: from && to ? from : null,
      to: from && to ? to : null,
    })
  }
  return { kind: 'promos', showQr: config.showQr, style: config.style, showPrices: config.showPrices, maxItems: config.maxItems, pageMs: config.pageSeconds * 1000, brand: brandOf(tenant), promos: out.slice(0, 40) }
}

export function promoAssets(board: PromoBoard): string[] {
  const out = new Set<string>()
  if (board.brand.logo) out.add(board.brand.logo)
  for (const p of board.promos) if (p.image) out.add(p.image)
  return [...out]
}

export function parseFeaturedConfig(raw: unknown): FeaturedConfig {
  const r = featuredConfigSchema.safeParse(raw ?? {})
  return r.success ? r.data : featuredConfigSchema.parse({})
}

export function parsePromosConfig(raw: unknown): PromosConfig {
  const r = promosConfigSchema.safeParse(raw ?? {})
  return r.success ? r.data : promosConfigSchema.parse({})
}

/** Config guardada → config válida (lo viejo o roto vuelve a los valores por defecto). */
export function parseMenuConfig(raw: unknown): MenuConfig {
  const r = menuConfigSchema.safeParse(raw ?? {})
  return r.success ? r.data : menuConfigSchema.parse({})
}
