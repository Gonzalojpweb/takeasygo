// ============================================================================
// Carta en pantalla — qué se muestra ahora (puro, sin DOM: se testea en node)
// ============================================================================
// La pantalla recibe la carta con el estado de cada producto al momento del
// último manifiesto y sus horarios. Decide sola, también sin internet:
//  · fuera de horario (producto, subcategoría o categoría) → no aparece;
//  · pausado (a mano o por stock) → desaparece o «Agotado», según la pieza;
//  · sin conexión: el horario se sigue evaluando con la hora corregida. Lo
//    que no se puede saber sin internet es una pausa o un precio nuevo: a los
//    30 min sin actualizar se avisa en la carta; a las 6 h la carta deja de
//    mostrarse (siguen las piezas subidas) hasta volver a actualizar.
// ============================================================================

import { inDaypart } from './schedule'

export interface Slot { days: number[]; from: string; to: string }

export interface BoardProduct {
  id: string
  name: string
  description: string | null
  price: number
  fromPrice: boolean
  originalPrice: number | null
  image: string | null
  available: boolean
  schedules: Slot[][]
  featured: boolean
}

export interface BoardSection { id: string; name: string; parent: string | null; products: BoardProduct[] }

export interface MenuBoard {
  kind: 'menu'
  /** QR «Pedí desde tu celular» (la URL viene en el manifiesto, una por pantalla). */
  showQr?: boolean
  style: 'brand' | 'dark' | 'light'
  showPhotos: boolean
  showDescriptions: boolean
  unavailable: 'hide' | 'mark'
  pageMs: number
  brand: { name: string; logo: string | null; primary: string; background: string | null; text: string | null }
  sections: BoardSection[]
}

/** Aviso en la carta: datos sin actualizar hace más de 30 min. */
export const BOARD_STALE_MS = 30 * 60_000
/** La carta deja de mostrarse: sin actualizar hace más de 6 h. */
export const BOARD_MAX_OFFLINE_MS = 6 * 60 * 60_000

export type Freshness = 'fresh' | 'stale' | 'expired'

/** Según la última vez que el manifiesto respondió (200 o 304). Nunca actualizado → vencida. */
export function boardFreshness(lastOkMs: number | null, nowMs: number): Freshness {
  if (!lastOkMs || !Number.isFinite(lastOkMs)) return 'expired'
  const age = nowMs - lastOkMs
  if (age > BOARD_MAX_OFFLINE_MS) return 'expired'
  if (age > BOARD_STALE_MS) return 'stale'
  return 'fresh'
}

/** Un horario de disponibilidad: abierto si alguna franja vale ahora. Franja sin días = nunca (igual que el menú). */
export function slotsOpen(slots: Slot[], nowMs: number, timeZone?: string | null): boolean {
  return slots.some((s) => Array.isArray(s.days) && s.days.length > 0 && inDaypart({ days: s.days, from: s.from, to: s.to }, nowMs, timeZone))
}

export type ProductState = 'show' | 'soldout' | 'hidden'

export function productState(p: BoardProduct, board: Pick<MenuBoard, 'unavailable'>, nowMs: number, timeZone?: string | null): ProductState {
  if (!p.schedules.every((slots) => slotsOpen(slots, nowMs, timeZone))) return 'hidden'
  if (!p.available) return board.unavailable === 'mark' ? 'soldout' : 'hidden'
  return 'show'
}

export interface BoardPage {
  section: BoardSection
  /** Página dentro de la sección (1…pages). */
  page: number
  pages: number
  products: Array<{ product: BoardProduct; soldOut: boolean }>
}

/** Productos por página según orientación y fotos (la grilla de la pantalla usa los mismos números). */
export function perPage(orientation: 'landscape' | 'portrait', showPhotos: boolean): number {
  if (orientation === 'landscape') return showPhotos ? 8 : 12
  return showPhotos ? 6 : 10
}

/** Páginas visibles ahora: secciones sin nada que mostrar se saltean. */
export function boardPages(board: MenuBoard, nowMs: number, timeZone: string | null | undefined, size: number): BoardPage[] {
  const out: BoardPage[] = []
  for (const section of board.sections) {
    const visible = section.products
      .map((product) => ({ product, state: productState(product, board, nowMs, timeZone) }))
      .filter((x) => x.state !== 'hidden')
      .map((x) => ({ product: x.product, soldOut: x.state === 'soldout' }))
    if (!visible.length) continue
    const pages = Math.ceil(visible.length / size)
    for (let i = 0; i < pages; i++) out.push({ section, page: i + 1, pages, products: visible.slice(i * size, (i + 1) * size) })
  }
  return out
}

/** $ 1.500 · $ 1.500,50 (centavos → pesos, formato argentino, sin depender de Intl). */
export function formatPrice(cents: number): string {
  const v = Math.round(cents) / 100
  const int = Math.floor(v)
  const dec = Math.round((v - int) * 100)
  const s = String(int).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `$ ${s}${dec ? ',' + String(dec).padStart(2, '0') : ''}`
}

/** Archivos de la carta que la pantalla tiene que tener guardados. */
export function boardAssets(board: MenuBoard): string[] {
  const out = new Set<string>()
  if (board.brand.logo) out.add(board.brand.logo)
  for (const s of board.sections) for (const p of s.products) if (p.image) out.add(p.image)
  return [...out]
}

/** Negro o blanco, lo que mejor se lea sobre el color (#rrggbb). */
export function readableOn(hex: string): '#000' | '#fff' {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#fff'
  const n = parseInt(m[1], 16)
  const lin = (c: number) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return L > 0.4 ? '#000' : '#fff'
}

export interface BoardColors { bg: string; text: string; muted: string; card: string; accent: string; onAccent: string }

export function boardColors(board: Pick<MenuBoard, 'style' | 'brand'>): BoardColors {
  const accent = board.brand.primary || '#E85D2A'
  const onAccent = readableOn(accent)
  if (board.style === 'light') return { bg: '#f7f7f5', text: '#141414', muted: '#5c5c5c', card: '#ffffff', accent, onAccent }
  if (board.style === 'brand' && board.brand.background && board.brand.text) {
    const dark = readableOn(board.brand.background) === '#fff'
    return { bg: board.brand.background, text: board.brand.text, muted: dark ? 'rgba(255,255,255,.7)' : 'rgba(0,0,0,.6)', card: dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.05)', accent, onAccent }
  }
  return { bg: '#101011', text: '#ffffff', muted: 'rgba(255,255,255,.66)', card: 'rgba(255,255,255,.07)', accent, onAccent }
}

// ── Promos por horario (Entrega 2) ──────────────────────────────────────────

export interface BoardPromo {
  id: string
  title: string
  text: string | null
  image: string | null
  price: number | null
  originalPrice: number | null
  percent: number | null
  startsAt: string | null
  endsAt: string | null
  days: number[]
  from: string | null
  to: string | null
}

export interface PromoBoard {
  kind: 'promos'
  showQr?: boolean
  style: 'brand' | 'dark' | 'light'
  showPrices: boolean
  maxItems: number
  pageMs: number
  brand: MenuBoard['brand']
  promos: BoardPromo[]
}

// ── Lo más pedido y venta sugerida (Entrega 3) ──────────────────────────────

export interface FeaturedProduct extends BoardProduct { reason: 'top' | 'featured' }
export interface FeaturedCombo { id: string; name: string; description: string | null; price: number | null; image: string | null }
export interface FeaturedBoard {
  kind: 'featured'
  showQr?: boolean
  style: 'brand' | 'dark' | 'light'
  maxItems: number
  pageMs: number
  brand: MenuBoard['brand']
  products: FeaturedProduct[]
  combos: FeaturedCombo[]
}

/** Productos a mostrar ahora: disponibles y en horario, en el orden del ranking, hasta maxItems. */
export function featuredVisible(b: FeaturedBoard, nowMs: number, timeZone?: string | null): FeaturedProduct[] {
  return b.products.filter((p) => productState(p, { unavailable: 'hide' }, nowMs, timeZone) === 'show').slice(0, b.maxItems)
}

// ── Composiciones (Élite) ───────────────────────────────────────────────────

export interface CompositionProduct extends BoardProduct { badge: string | null }
export interface CompositionCombo { id: string; name: string; description: string | null; price: number | null; image: string | null; includes: string[] }
export interface CompositionRow { id: string; name: string; price: number; fromPrice: boolean; available: boolean; schedules: Slot[][] }
export interface CompositionSection { id: string; name: string; parent: string | null; products: CompositionRow[] }
export interface ModuleAnimation { enter: 'auto' | 'none' | 'fade' | 'fadeUp' | 'scaleIn' | 'slideLeft' | 'slideRight' | 'stagger'; duration: number; delay: number; ease: string; stagger: number }
export type ResolvedModule = (
  | { type: 'brand-header'; config: { tagline: string; showLogo: boolean } }
  | { type: 'hero-product'; config: { badge: string; kenBurns?: boolean; showDiscount?: boolean }; product: CompositionProduct | null }
  | { type: 'product-grid'; config: { showDescriptions: boolean }; products: CompositionProduct[] }
  | { type: 'combo-highlight'; config: { badge: string; kenBurns?: boolean }; combo: CompositionCombo | null }
  | { type: 'promo-banner'; config: { headline: string; kenBurns?: boolean; showDiscount?: boolean }; promo: BoardPromo | null }
  | { type: 'drinks-row'; products: CompositionProduct[] }
  | { type: 'price-list'; sections: CompositionSection[] }
  | { type: 'illustration-block'; config: { text: string; imagePosition: 'left' | 'right' | 'top' | 'bottom'; kenBurns?: boolean }; imageUrl: string | null }
  | { type: 'qr-cta'; config: { headline: string; subtext: string } }
) & { animation?: ModuleAnimation | null }
export interface CompositionBoard {
  kind: 'composition'
  showQr?: boolean
  /** Lienzo de diseño (composiciones viejas no lo traen: se usa el de la pantalla). */
  orientation?: 'landscape' | 'portrait'
  designWidth?: number
  designHeight?: number
  transition?: 'fade' | 'slide' | 'zoom' | 'none'
  style: 'brand' | 'dark' | 'light'
  pageMs: number
  brand: MenuBoard['brand'] & { fontHeading: string | null; fontBody: string | null; fontFiles: Array<{ family: string; url: string; role: 'heading' | 'body' }> }
  modules: ResolvedModule[]
}

const showNow = (p: { available: boolean; schedules: Slot[][] }, nowMs: number, tz?: string | null) =>
  p.available && p.schedules.every((slots) => slotsOpen(slots, nowMs, tz))

/**
 * Módulos a dibujar AHORA (también sin internet): lo pausado o fuera de
 * horario se saca; la promo vencida o fuera de franja, también. Un módulo que
 * se queda sin nada desaparece y el resto ocupa su lugar.
 */
export function compositionVisible(b: CompositionBoard, nowMs: number, tz?: string | null): ResolvedModule[] {
  const out: ResolvedModule[] = []
  for (const m of b.modules) {
    switch (m.type) {
      case 'hero-product': if (m.product && showNow(m.product, nowMs, tz)) out.push(m); break
      case 'product-grid': case 'drinks-row': {
        const products = m.products.filter((p) => showNow(p, nowMs, tz))
        if (products.length) out.push({ ...m, products } as ResolvedModule)
        break
      }
      case 'combo-highlight': if (m.combo) out.push(m); break
      case 'promo-banner': if (m.promo && promoActive(m.promo, nowMs, tz)) out.push(m); break
      case 'price-list': {
        const sections = m.sections.map((s) => ({ ...s, products: s.products.filter((p) => showNow(p, nowMs, tz)) })).filter((s) => s.products.length)
        if (sections.length) out.push({ ...m, sections })
        break
      }
      case 'illustration-block': if (m.imageUrl || m.config.text) out.push(m); break
      default: out.push(m)
    }
  }
  // Solo encabezado o solo QR no alcanza para ocupar la pantalla.
  return out.some((m) => m.type !== 'brand-header' && m.type !== 'qr-cta') ? out : []
}

export type ScreenBoard = MenuBoard | PromoBoard | FeaturedBoard | CompositionBoard

/**
 * ¿La promo vale ahora en la sede? Fechas (ventana efectiva que manda el
 * servidor), días y franja. La madrugada de una franja nocturna cuenta para
 * el día en que empezó (igual que el menú y el checkout). Sin internet sigue
 * funcionando: al vencer, se apaga sola.
 */
export function promoActive(p: BoardPromo, nowMs: number, timeZone?: string | null): boolean {
  const start = p.startsAt ? Date.parse(p.startsAt) : NaN
  const end = p.endsAt ? Date.parse(p.endsAt) : NaN
  if (Number.isFinite(start) && nowMs < start) return false
  if (Number.isFinite(end) && nowMs > end) return false
  return inDaypart({ days: p.days, from: p.from, to: p.to }, nowMs, timeZone)
}

/** Promos a mostrar en esta vuelta (las vigentes ahora, hasta maxItems). */
export function activePromos(board: PromoBoard, nowMs: number, timeZone?: string | null): BoardPromo[] {
  return board.promos.filter((p) => promoActive(p, nowMs, timeZone)).slice(0, board.maxItems)
}

const DAY_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** «Hoy hasta las 23:00» · «Lun a vie de 12:00 a 15:00» · null si vale siempre. */
export function promoWhen(p: BoardPromo): string | null {
  const days = [...new Set(p.days)].sort()
  const order = [1, 2, 3, 4, 5, 6, 0]
  let d = ''
  if (days.length && days.length < 7) {
    const idx = days.map((x) => order.indexOf(x)).sort((a, b) => a - b)
    const consecutive = idx.length >= 3 && idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
    d = consecutive ? `${DAY_SHORT[order[idx[0]]]} a ${DAY_SHORT[order[idx[idx.length - 1]]]}` : idx.map((i) => DAY_SHORT[order[i]]).join(', ')
  }
  const h = p.from && p.to ? `de ${p.from} a ${p.to}` : ''
  const s = [d, h].filter(Boolean).join(' ')
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : null
}

export function promoBoardAssets(board: PromoBoard): string[] {
  const out = new Set<string>()
  if (board.brand.logo) out.add(board.brand.logo)
  for (const p of board.promos) if (p.image) out.add(p.image)
  return [...out]
}

/**
 * Reparte módulos en páginas según su alto natural (px). Greedy y en orden:
 * se agrega a la página mientras entre; un módulo que solo no entra va en su
 * propia página (y ahí cede alto: la lista de precios recorta filas).
 * Devuelve índices por página. `budget` = alto disponible sin el encabezado.
 */
export function packModules(heights: number[], budget: number): number[][] {
  const pages: number[][] = []
  let cur: number[] = []
  let used = 0
  heights.forEach((hgt, i) => {
    if (cur.length && used + hgt > budget) { pages.push(cur); cur = []; used = 0 }
    cur.push(i)
    used += hgt
  })
  if (cur.length) pages.push(cur)
  return pages
}

/** Escala para meter el lienzo de diseño en la pantalla sin deformar (y el margen para centrarlo). */
export function fitCanvas(dw: number, dh: number, sw: number, sh: number): { scale: number; x: number; y: number } {
  const scale = Math.min(sw / dw, sh / dh)
  return { scale, x: Math.round((sw - dw * scale) / 2), y: Math.round((sh - dh * scale) / 2) }
}

/** % de descuento a mostrar en el sello (redondeado; solo si es ≥ 5 %). */
export function discountPercent(price: number, original: number | null): number | null {
  if (!original || !(original > price) || !(price > 0)) return null
  const pct = Math.round((1 - price / original) * 100)
  return pct >= 5 ? pct : null
}
