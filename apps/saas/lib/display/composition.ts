// ============================================================================
// Composiciones (Élite) — armado de los datos para la pantalla (23/11/2026)
// ============================================================================
// Una composición es UNA pantalla hecha con módulos elegidos por el comercio.
// Convive con carta, promos y «lo más pedido» (no los reemplaza).
// Igual que las otras plantillas, todo sale de los datos de TakeasyGO:
//  · productos de la carta de la sede (precio, foto, pausa, horarios: la
//    pantalla oculta lo pausado o fuera de horario, también sin internet);
//  · combos vendibles ahora (lo que incluye sale de su itemPool);
//  · promos del comercio con su ventana, días y franja (se apagan solas);
//  · logo, colores y tipografías de la marca (las fuentes viajan como
//    archivos guardados en el equipo: nunca se piden a internet en la TV).
// Función pura: recibe documentos ya leídos y devuelve datos serializables.
// ============================================================================

import { boardImageUrl, brandOf, priceOf, slotsOf, type AnyDoc, type BoardBrand, type BoardProduct, type BoardPromo, type Slot } from '@/lib/display/templates'
import type { CompositionConfig } from '@/lib/display/composition-schema'

export interface CompositionProduct extends BoardProduct {
  badge: string | null
}
export interface CompositionCombo {
  id: string
  name: string
  description: string | null
  price: number | null
  image: string | null
  /** Nombres de lo que se puede elegir en el combo. */
  includes: string[]
}
export interface CompositionSection {
  id: string
  name: string
  parent: string | null
  products: Array<{ id: string; name: string; price: number; fromPrice: boolean; available: boolean; schedules: Slot[][] }>
}

export type ResolvedModule =
  | { type: 'brand-header'; config: { tagline: string; showLogo: boolean } }
  | { type: 'hero-product'; config: { badge: string }; product: CompositionProduct | null }
  | { type: 'product-grid'; config: { showDescriptions: boolean }; products: CompositionProduct[] }
  | { type: 'combo-highlight'; config: { badge: string }; combo: CompositionCombo | null }
  | { type: 'promo-banner'; config: { headline: string }; promo: BoardPromo | null }
  | { type: 'drinks-row'; products: CompositionProduct[] }
  | { type: 'price-list'; sections: CompositionSection[] }
  | { type: 'illustration-block'; config: { text: string; imagePosition: 'left' | 'right' | 'top' | 'bottom' }; imageUrl: string | null }
  | { type: 'qr-cta'; config: { headline: string; subtext: string } }

export interface FontFile { family: string; url: string; role: 'heading' | 'body' }

export interface CompositionBrand extends BoardBrand {
  fontHeading: string | null
  fontBody: string | null
  /** Archivos de fuente a guardar en el equipo (woff2 preferido). */
  fontFiles: FontFile[]
}

export interface CompositionBoard {
  kind: 'composition'
  showQr: boolean
  style: 'brand' | 'dark' | 'light'
  pageMs: number
  brand: CompositionBrand
  modules: ResolvedModule[]
}

const FAMILY_RE = /^[A-Za-z0-9 \-]{1,60}$/
const httpsUrl = (u: unknown): string | null => (typeof u === 'string' && /^https:\/\/[^\s"'()]+$/.test(u) ? u : null)

/**
 * Marca con tipografías. `resolvedFonts` trae la URL ya resuelta de las
 * fuentes de Google sin archivo propio (lib/display/fonts.ts); si una fuente
 * no tiene archivo, la pantalla usa la del sistema.
 */
export function compositionBrandOf(tenant: AnyDoc, resolvedFonts: Record<string, string | null> = {}): CompositionBrand {
  const base = brandOf(tenant)
  const fonts = tenant?.branding?.fonts ?? {}
  const files: FontFile[] = []
  const pick = (role: 'heading' | 'body'): string | null => {
    const f = fonts?.[role]
    const family = typeof f?.family === 'string' && FAMILY_RE.test(f.family.trim()) ? f.family.trim() : null
    if (!family) return null
    const url = httpsUrl(f?.files?.woff2) || httpsUrl(f?.files?.woff) || httpsUrl(f?.files?.ttf) || httpsUrl(resolvedFonts[family])
    if (url && !files.some((x) => x.family === family)) files.push({ family, url, role })
    return family
  }
  const fontHeading = pick('heading')
  const fontBody = pick('body')
  return { ...base, fontHeading, fontBody, fontFiles: files }
}

/** Fuentes de Google sin archivo propio que hay que resolver (familias). */
export function googleFamiliesToResolve(tenant: AnyDoc): string[] {
  const fonts = tenant?.branding?.fonts ?? {}
  const out = new Set<string>()
  for (const role of ['heading', 'body'] as const) {
    const f = fonts?.[role]
    if (f?.source !== 'google') continue
    if (httpsUrl(f?.files?.woff2) || httpsUrl(f?.files?.woff) || httpsUrl(f?.files?.ttf)) continue
    const fam = typeof f?.family === 'string' ? f.family.trim() : ''
    if (FAMILY_RE.test(fam)) out.add(fam)
  }
  return [...out]
}

interface CatalogEntry { item: AnyDoc; schedules: Slot[][]; category: AnyDoc }

function catalogOf(menu: AnyDoc | null): Map<string, CatalogEntry> {
  const map = new Map<string, CatalogEntry>()
  for (const c of menu?.categories ?? []) {
    if (c?.isAvailable === false) continue
    const cs = slotsOf(c)
    const base = cs ? [cs] : []
    for (const i of c.items ?? []) map.set(String(i._id), { item: i, schedules: base, category: c })
    for (const s of c.subcategories ?? []) {
      const ss = slotsOf(s)
      const inh = ss ? [...base, ss] : base
      for (const i of s.items ?? []) map.set(String(i._id), { item: i, schedules: inh, category: c })
    }
  }
  return map
}

function resolveProduct(catalog: Map<string, CatalogEntry>, id: string, channel: 'dine-in' | 'takeaway', size: number, badge = '', withDescription = true): CompositionProduct | null {
  const e = catalog.get(id)
  if (!e) return null
  const i = e.item
  if (channel === 'takeaway' && i.isTakeawayAvailable === false) return null
  const { price, fromPrice, originalPrice } = priceOf(i, channel)
  if (!(price > 0)) return null
  const own = slotsOf(i)
  return {
    id,
    name: String(i.name ?? '').slice(0, 80),
    description: withDescription && i.description ? String(i.description).slice(0, 140) : null,
    price, fromPrice, originalPrice,
    image: boardImageUrl(i.imageUrl, size, size),
    available: i.isAvailable !== false,
    schedules: own ? [...e.schedules, own] : e.schedules,
    featured: !!i.isFeatured,
    badge: badge || null,
  }
}

export function buildCompositionBoard(
  menu: AnyDoc | null,
  tenant: AnyDoc,
  config: CompositionConfig,
  /** Combos vendibles ahora en la sede (sellableCombos). */
  combos: AnyDoc[],
  /** Promos ya resueltas para pantalla (buildPromoBoard: sin solo-delivery, agotadas ni vencidas). */
  promos: BoardPromo[],
  resolvedFonts: Record<string, string | null> = {},
): CompositionBoard {
  const catalog = catalogOf(menu)
  const modules: ResolvedModule[] = []
  for (const mod of config.modules) {
    switch (mod.type) {
      case 'brand-header':
        modules.push({ type: 'brand-header', config: { tagline: mod.config.tagline, showLogo: mod.config.showLogo } })
        break
      case 'hero-product':
        modules.push({ type: 'hero-product', config: { badge: mod.config.badge }, product: resolveProduct(catalog, mod.config.productId, mod.config.priceChannel, 960, mod.config.badge) })
        break
      case 'product-grid':
        modules.push({
          type: 'product-grid',
          config: { showDescriptions: mod.config.showDescriptions },
          products: mod.config.productIds.map((id) => resolveProduct(catalog, id, mod.config.priceChannel, 480, '', mod.config.showDescriptions)).filter((p): p is CompositionProduct => !!p),
        })
        break
      case 'combo-highlight': {
        const doc = combos.find((c) => String(c._id) === mod.config.comboId)
        modules.push({
          type: 'combo-highlight',
          config: { badge: mod.config.badge },
          combo: doc ? {
            id: String(doc._id),
            name: String(doc.name ?? '').slice(0, 80),
            description: doc.description ? String(doc.description).slice(0, 140) : null,
            price: doc.priceMode === 'fixed' && Number(doc.fixedPrice) > 0 ? Number(doc.fixedPrice) : null,
            image: boardImageUrl(doc.style?.imageUrl, 720, 720),
            includes: (Array.isArray(doc.itemPool) ? doc.itemPool : []).map((id: unknown) => catalog.get(String(id))?.item?.name).filter((n: unknown): n is string => typeof n === 'string').slice(0, 8),
          } : null,
        })
        break
      }
      case 'promo-banner':
        modules.push({ type: 'promo-banner', config: { headline: mod.config.headline }, promo: promos.find((p) => p.id === mod.config.promotionId) ?? null })
        break
      case 'drinks-row':
        modules.push({ type: 'drinks-row', products: mod.config.productIds.map((id) => resolveProduct(catalog, id, mod.config.priceChannel, 320, '', false)).filter((p): p is CompositionProduct => !!p) })
        break
      case 'price-list': {
        const sections: CompositionSection[] = []
        const cats = (menu?.categories ?? []).filter((c: AnyDoc) => c?.isAvailable !== false)
        const toRow = (i: AnyDoc, inherited: Slot[][]) => {
          if (mod.config.priceChannel === 'takeaway' && i.isTakeawayAvailable === false) return null
          const { price, fromPrice } = priceOf(i, mod.config.priceChannel)
          if (!(price > 0)) return null
          const own = slotsOf(i)
          return { id: String(i._id), name: String(i.name ?? '').slice(0, 80), price, fromPrice, available: i.isAvailable !== false, schedules: own ? [...inherited, own] : inherited }
        }
        for (const catId of mod.config.categoryIds) {
          const cat = cats.find((c: AnyDoc) => String(c._id) === catId)
          if (!cat) continue
          const cs = slotsOf(cat)
          const base = cs ? [cs] : []
          const direct = (cat.items ?? []).map((i: AnyDoc) => toRow(i, base)).filter(Boolean) as CompositionSection['products']
          if (direct.length) sections.push({ id: String(cat._id), name: String(cat.name ?? ''), parent: null, products: direct })
          if (mod.config.showSubcategories) {
            for (const sub of cat.subcategories ?? []) {
              const ss = slotsOf(sub)
              const rows = (sub.items ?? []).map((i: AnyDoc) => toRow(i, ss ? [...base, ss] : base)).filter(Boolean) as CompositionSection['products']
              if (rows.length) sections.push({ id: String(sub._id), name: String(sub.name ?? ''), parent: String(cat.name ?? ''), products: rows })
            }
          }
        }
        modules.push({ type: 'price-list', sections })
        break
      }
      case 'illustration-block':
        modules.push({ type: 'illustration-block', config: { text: mod.config.text, imagePosition: mod.config.imagePosition }, imageUrl: boardImageUrl(mod.config.imageUrl, 960, 960) })
        break
      case 'qr-cta':
        modules.push({ type: 'qr-cta', config: { headline: mod.config.headline, subtext: mod.config.subtext } })
        break
    }
  }
  return { kind: 'composition', showQr: config.showQr, style: config.style, pageMs: config.pageSeconds * 1000, brand: compositionBrandOf(tenant, resolvedFonts), modules }
}

/** ¿Tiene algo con contenido? (si no, la pieza no se manda). */
export function compositionHasContent(b: CompositionBoard): boolean {
  return b.modules.some((m) =>
    m.type === 'brand-header' || m.type === 'qr-cta'
    || (m.type === 'illustration-block' && !!m.imageUrl)
    || (m.type === 'hero-product' && !!m.product)
    || ((m.type === 'product-grid' || m.type === 'drinks-row') && m.products.length > 0)
    || (m.type === 'combo-highlight' && !!m.combo)
    || (m.type === 'promo-banner' && !!m.promo)
    || (m.type === 'price-list' && m.sections.length > 0))
}

/** Archivos que la pantalla tiene que guardar (fotos, logo y fuentes). */
export function compositionAssets(b: CompositionBoard): string[] {
  const out = new Set<string>()
  if (b.brand.logo) out.add(b.brand.logo)
  for (const f of b.brand.fontFiles) out.add(f.url)
  for (const m of b.modules) {
    if (m.type === 'hero-product' && m.product?.image) out.add(m.product.image)
    if ((m.type === 'product-grid' || m.type === 'drinks-row')) for (const p of m.products) if (p.image) out.add(p.image)
    if (m.type === 'combo-highlight' && m.combo?.image) out.add(m.combo.image)
    if (m.type === 'promo-banner' && m.promo?.image) out.add(m.promo.image)
    if (m.type === 'illustration-block' && m.imageUrl) out.add(m.imageUrl)
  }
  return [...out]
}
