// ============================================================================
// Display Studio — datos que viajan a la pantalla (servidor)
// ============================================================================
// Una pieza de Studio → board 'studio': plantilla, lienzo, valores ya
// validados (imágenes en tamaño de pantalla), marca (logo, colores, nombre) y
// las fuentes elegidas como archivos a guardar en el equipo (nunca se piden a
// internet en la TV).
//
// Vínculo con la carta (Proximo_Nivel §2): se resuelve ACÁ, al armar el
// manifiesto (no en la pantalla). Nombre, descripción, precio (y tachado),
// foto, badges (más vendido · destacado · nuevo) y disponibilidad de la sede.
// Lo que el usuario cambió a mano gana; lo que dejó vacío sigue a la carta, así
// un cambio de precio o una pausa se ven solos en el próximo ciclo (≤ 60 s).
//   · Listas (campo products): values.__items
//   · Platos fijos (slots): se completan item1Name, item1Price, image1… y
//     viajan __slots[slot] = { badges, originalPrice, soldOut }
// ============================================================================

import { boardImageUrl, priceOf, type AnyDoc } from '@/lib/display/templates'
import { compositionBrandOf, type CompositionBrand } from '@/lib/display/composition'
import {
  CARTA_ROWS, STUDIO_ALL_MAX, productsKeys, slotProductKey, slotsOf, studioTemplate,
  type ParsedStudioConfig, type StudioItemOverride, type StudioResolvedItem,
} from '@/lib/display/studio/catalog'

export interface StudioBoard {
  kind: 'studio'
  templateId: string
  tier: 'free' | 'premium'
  orientation: 'landscape' | 'portrait'
  designWidth: number
  designHeight: number
  viewing: 'near' | 'far'
  /** Compatibilidad con el resto de las plantillas del reproductor (colores del detalle). */
  style: 'brand'
  pageMs: number
  showQr: boolean
  values: Record<string, unknown>
  brand: CompositionBrand
  /** Fuentes elegidas (familia → archivo). Las que no se pudieron resolver quedan con la del sistema. */
  fontFiles: Array<{ family: string; url: string }>
  /** Páginas (lista larga de la carta): la pieza dura pageMs × pages. */
  pages: number
  /** Preset de movimiento (Proximo_Nivel §4): suave, estándar o impacto. */
  motion: 'calm' | 'standard' | 'impact'
}

/** Datos de la carta que necesita el vínculo. */
export interface StudioBindingCtx {
  menu: AnyDoc | null
  /** Platos más vendidos de la sede (para el badge «Más vendido»). */
  topIds?: string[]
}

type Overrides = Record<string, StudioItemOverride>
const NEW_TAG = /^(nuevo|nueva|new)$/i
const TOP_N = 5

const sized = (url: string, side: number) => (/\/e_background_removal\//.test(url) ? url : boardImageUrl(url, side, side, 'fit'))

function badgesOf(item: AnyDoc, id: string, top: Set<string>): StudioResolvedItem['badges'] {
  const out: StudioResolvedItem['badges'] = []
  if (top.has(id)) out.push('top')
  if (item?.isFeatured === true) out.push('featured')
  if (Array.isArray(item?.tags) && item.tags.some((x: unknown) => typeof x === 'string' && NEW_TAG.test(x.trim()))) out.push('new')
  return out
}

function toItem(id: string, item: AnyDoc, category: string, ov: StudioItemOverride | undefined, top: Set<string>): StudioResolvedItem {
  const { price, originalPrice } = priceOf(item, 'dine-in')
  const ownPrice = typeof ov?.price === 'number' && ov.price > 0 ? ov.price : null
  return {
    id,
    name: (ov?.name?.trim() || String(item.name ?? '')).slice(0, 80),
    description: (ov?.description?.trim() || (item.description ? String(item.description) : '')).slice(0, 140),
    price: ownPrice ?? (price > 0 ? price : null),
    originalPrice: ownPrice ? null : originalPrice,
    // Foto propia del plato (subida en Studio) o la de la carta; sin foto → la pantalla usa el respaldo tipográfico.
    image: ov?.url ? sized(ov.url, 1200) : boardImageUrl(item.imageUrl, 1200, 1200, 'fit'),
    cutout: !!ov?.url && ov.cutout === true,
    category: category.slice(0, 40),
    badges: badgesOf(item, id, top),
    available: item?.isAvailable !== false,
  }
}

function catalogMap(menu: AnyDoc | null): Map<string, { item: AnyDoc; category: string }> {
  const map = new Map<string, { item: AnyDoc; category: string }>()
  for (const c of menu?.categories ?? []) {
    if (c?.isAvailable === false) continue
    const cat = String(c.name ?? '')
    for (const i of c.items ?? []) map.set(String(i._id), { item: i, category: cat })
    for (const s of c.subcategories ?? []) for (const i of s.items ?? []) map.set(String(i._id), { item: i, category: cat })
  }
  return map
}

/** «Toda la carta» (o las categorías elegidas), en el orden de la carta, con tope. */
export function resolveStudioAll(menu: AnyDoc | null, categoryIds: unknown, overrides: Overrides = {}, opts: { markUnavailable?: boolean; topIds?: string[] } = {}): StudioResolvedItem[] {
  const only = Array.isArray(categoryIds) && categoryIds.length ? new Set(categoryIds.map(String)) : null
  const top = new Set((opts.topIds ?? []).slice(0, TOP_N))
  const cats = [...(menu?.categories ?? [])].sort((a: AnyDoc, b: AnyDoc) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const out: StudioResolvedItem[] = []
  for (const c of cats) {
    if (c?.isAvailable === false || (only && !only.has(String(c._id)))) continue
    const cat = String(c.name ?? '')
    const items = [...(c.items ?? []), ...(c.subcategories ?? []).flatMap((x: AnyDoc) => x.items ?? [])]
    for (const i of items) {
      if (i?.isAvailable === false && !opts.markUnavailable) continue
      out.push(toItem(String(i._id), i, cat, overrides[String(i._id)], top))
      if (out.length >= STUDIO_ALL_MAX) return out
    }
  }
  return out
}

/** Platos elegidos, en el orden elegido. Lo que ya no existe en la carta se saltea. */
export function resolveStudioProducts(menu: AnyDoc | null, ids: unknown, overrides: Overrides = {}, opts: { markUnavailable?: boolean; topIds?: string[] } = {}): StudioResolvedItem[] {
  if (!Array.isArray(ids) || !ids.length) return []
  const cat = catalogMap(menu)
  const top = new Set((opts.topIds ?? []).slice(0, TOP_N))
  const out: StudioResolvedItem[] = []
  for (const id of ids) {
    if (typeof id !== 'string') continue
    const e = cat.get(id)
    if (!e || (e.item?.isAvailable === false && !opts.markUnavailable)) continue
    out.push(toItem(id, e.item, e.category, overrides[id], top))
  }
  return out
}

export function buildStudioBoard(
  config: ParsedStudioConfig,
  tenant: AnyDoc,
  fonts: Record<string, string | null>,
  binding: AnyDoc | null | StudioBindingCtx = null,
): StudioBoard {
  const ctx: StudioBindingCtx = binding && typeof binding === 'object' && 'menu' in binding ? (binding as StudioBindingCtx) : { menu: (binding as AnyDoc | null) ?? null }
  const t = studioTemplate(config.templateId)!
  const values: Record<string, unknown> = { ...config.values }
  const fontFiles: StudioBoard['fontFiles'] = []

  // Platos fijos vinculados: lo vacío se completa desde la carta (siempre al día).
  const catalog = slotsOf(t).length ? catalogMap(ctx.menu) : new Map()
  const top = new Set((ctx.topIds ?? []).slice(0, TOP_N))
  const slotMeta: Record<string, { badges: StudioResolvedItem['badges']; originalPrice: number | null; soldOut: boolean }> = {}
  for (const slot of slotsOf(t)) {
    const pid = values[slotProductKey(slot)]
    if (typeof pid !== 'string' || !pid) continue
    const e = catalog.get(pid)
    if (!e) continue
    const it = toItem(pid, e.item, e.category, undefined, top)
    let ownPrice = false
    for (const f of t.fields) {
      if (f.slot !== slot) continue
      const cur = values[f.key]
      if (f.slotRole === 'name' && !String(cur ?? '').trim()) values[f.key] = it.name.slice(0, f.max ?? 80)
      if (f.slotRole === 'desc' && !String(cur ?? '').trim()) values[f.key] = it.description.slice(0, f.max ?? 140)
      if (f.slotRole === 'price') { if (typeof cur === 'number' && cur > 0) ownPrice = true; else values[f.key] = it.price }
      if (f.slotRole === 'image' && !String(cur ?? '').trim() && e.item?.imageUrl) { values[f.key] = String(e.item.imageUrl); values[`${f.key}Cutout`] = false }
    }
    slotMeta[slot] = { badges: it.badges, originalPrice: ownPrice ? null : it.originalPrice, soldOut: !it.available }
  }
  if (Object.keys(slotMeta).length) values.__slots = slotMeta

  for (const f of t.fields) {
    const v = values[f.key]
    // Una foto con «Quitar fondo HD» ya es una derivada: no se le encadena otra transformación (se pagaría de nuevo).
    if (f.type === 'image' && typeof v === 'string' && v) values[f.key] = sized(v, 1600)
    if (f.type === 'font' && typeof v === 'string' && v !== 'brand') {
      const url = fonts[v]
      if (url && !fontFiles.some((x) => x.family === v)) fontFiles.push({ family: v, url })
    }
  }

  let pages = 1
  const pf = t.fields.find((f) => f.type === 'products' && (!f.showIf || values[f.showIf.key] === f.showIf.equals))
  if (pf) {
    const k = productsKeys(pf.key)
    const overrides = (values[k.overrides] && typeof values[k.overrides] === 'object' ? values[k.overrides] : {}) as Overrides
    const opts = { markUnavailable: values[k.unavailable] === 'mark', topIds: ctx.topIds }
    const items = pf.allowAll && values[k.mode] === 'all'
      ? resolveStudioAll(ctx.menu, values[k.categories], overrides, opts)
      : resolveStudioProducts(ctx.menu, values[pf.key], overrides, opts)
    values.__items = items
    if (t.id === 'carta-lista') pages = Math.max(1, Math.ceil(items.length / CARTA_ROWS[config.orientation]))
  }
  const motion = config.motion ?? 'standard'
  return {
    kind: 'studio',
    templateId: t.id,
    tier: t.tier,
    orientation: config.orientation,
    designWidth: config.designWidth,
    designHeight: config.designHeight,
    viewing: config.viewing,
    style: 'brand',
    pageMs: config.pageSeconds * 1000,
    showQr: values.showQr !== false,
    values,
    brand: compositionBrandOf(tenant, fonts),
    fontFiles,
    pages,
    motion,
  }
}

export function studioAssets(b: StudioBoard): string[] {
  const out = new Set<string>()
  if (b.brand.logo && b.values.showLogo !== false) out.add(b.brand.logo)
  for (const f of b.brand.fontFiles) out.add(f.url)
  for (const f of b.fontFiles) out.add(f.url)
  const t = studioTemplate(b.templateId)
  for (const f of t?.fields ?? []) {
    const v = b.values[f.key]
    if (f.type === 'image' && typeof v === 'string' && v) out.add(v)
  }
  const items = b.values.__items
  if (Array.isArray(items)) for (const it of items as StudioResolvedItem[]) if (it?.image) out.add(it.image)
  return [...out]
}
