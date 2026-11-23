// ============================================================================
// Pantallas — «Lo más pedido» y venta sugerida (22/11/2026)
// ============================================================================
// Regla simple, sin IA:
//  1. Lo más pedido EN ESA SEDE en los últimos 14 días (cantidad de unidades,
//     pedidos no cancelados). Solo conteos agregados por producto: nunca
//     clientes, teléfonos ni pedidos sueltos.
//  2. Si no alcanza (sede nueva), lo marcado como «Destacado» en la carta.
//  3. Los combos activos de la sede, vendibles ahora.
// Disponibilidad y horarios salen de la carta, igual que en la carta en
// pantalla: un producto pausado o fuera de horario no se muestra.
// El ranking se cachea 30 min por sede (no se recalcula en cada manifiesto).
// ============================================================================

import { channelPrice } from '@takeasygo/business/browser'
import mongoose from 'mongoose'
import Order from '@/models/Order'
import Combo from '@/models/Combo'
import { isComboAvailable, isComboOnSchedule } from '@takeasygo/business'
import { boardImageUrl, brandOf, type BoardBrand, type BoardProduct, type FeaturedConfig, type MenuStyle, type Slot } from '@/lib/display/templates'

export interface FeaturedProduct extends BoardProduct {
  /** Por qué está: 'top' = de lo más pedido; 'featured' = destacado en la carta. */
  reason: 'top' | 'featured'
}
export interface FeaturedCombo { id: string; name: string; description: string | null; price: number | null; image: string | null }

export interface FeaturedBoard {
  kind: 'featured'
  showQr: boolean
  style: MenuStyle
  maxItems: number
  pageMs: number
  brand: BoardBrand
  products: FeaturedProduct[]
  combos: FeaturedCombo[]
}

export const TOP_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
const TOP_CACHE_MS = 30 * 60 * 1000
const topCache = new Map<string, { at: number; ids: string[] }>()

/** Ranking de productos de la sede (ids de la carta), cacheado. */
export async function topItemIds(tenantId: unknown, locationId: unknown, now = Date.now()): Promise<string[]> {
  const key = `${String(tenantId)}|${String(locationId)}`
  const hit = topCache.get(key)
  if (hit && now - hit.at < TOP_CACHE_MS) return hit.ids
  const rows = await Order.aggregate<{ _id: unknown; units: number }>([
    { $match: {
      tenantId: new mongoose.Types.ObjectId(String(tenantId)),
      locationId: new mongoose.Types.ObjectId(String(locationId)),
      createdAt: { $gte: new Date(now - TOP_WINDOW_MS) },
      status: { $nin: ['cancelled', 'awaiting_payment', 'requires_manual_attention'] },
    } },
    { $unwind: '$items' },
    { $match: { 'items.menuItemId': { $ne: null } } },
    { $group: { _id: '$items.menuItemId', units: { $sum: '$items.quantity' } } },
    { $sort: { units: -1 } },
    { $limit: 30 },
  ])
  const ids = rows.map((r) => String(r._id))
  topCache.set(key, { at: now, ids })
  return ids
}
export function __clearTopCache() { topCache.clear() }

type AnyDoc = Record<string, any>
const HM = /^([01]\d|2[0-3]):[0-5]\d$/
function slotsOf(node: AnyDoc): Slot[] | null {
  if (node?.availabilityMode !== 'scheduled') return null
  return (Array.isArray(node.availabilitySchedule) ? node.availabilitySchedule : [])
    .filter((s: AnyDoc) => HM.test(s?.timeStart ?? '') && HM.test(s?.timeEnd ?? ''))
    .map((s: AnyDoc) => ({ days: (s.days ?? []).filter((d: unknown) => Number.isInteger(d)), from: s.timeStart, to: s.timeEnd }))
}

/** Arma el bloque con el ranking, los destacados y los combos (puro salvo los datos que recibe). */
export function buildFeaturedBoard(menu: AnyDoc | null, tenant: AnyDoc, config: FeaturedConfig, ranking: string[], combos: AnyDoc[]): FeaturedBoard {
  const catalog = new Map<string, { item: AnyDoc; schedules: Slot[][] }>()
  for (const c of menu?.categories ?? []) {
    if (c?.isAvailable === false) continue
    const cs = slotsOf(c)
    const base = cs ? [cs] : []
    for (const i of c.items ?? []) catalog.set(String(i._id), { item: i, schedules: base })
    for (const s of c.subcategories ?? []) {
      const ss = slotsOf(s)
      for (const i of s.items ?? []) catalog.set(String(i._id), { item: i, schedules: ss ? [...base, ss] : base })
    }
  }
  const pick = (n: AnyDoc) => channelPrice(n as never, config.priceChannel === 'takeaway' ? 'takeaway' : 'dine-in')
  const toProduct = (id: string, reason: 'top' | 'featured'): FeaturedProduct | null => {
    const e = catalog.get(id)
    if (!e) return null
    const i = e.item
    if (config.priceChannel === 'takeaway' && i.isTakeawayAvailable === false) return null
    const variants = (i.variants ?? []).filter((v: AnyDoc) => !(i.disabledVariantNames ?? []).includes(v?.name))
    const prices = variants.map((v: AnyDoc) => Number(pick(v)) || 0).filter((p: number) => p > 0)
    const price = prices.length ? Math.min(...prices) : Number(pick(i)) || 0
    if (!(price > 0)) return null
    const own = slotsOf(i)
    return {
      id, name: String(i.name ?? '').slice(0, 80), description: i.description ? String(i.description).slice(0, 140) : null,
      price, fromPrice: prices.length > 1, originalPrice: null, image: boardImageUrl(i.imageUrl, 720, 720),
      available: i.isAvailable !== false, schedules: own ? [...e.schedules, own] : e.schedules, featured: !!i.isFeatured, reason,
    }
  }
  const seen = new Set<string>()
  const products: FeaturedProduct[] = []
  for (const id of ranking) { if (seen.has(id)) continue; const p = toProduct(id, 'top'); if (p) { products.push(p); seen.add(id) } }
  for (const [id, e] of catalog) { if (!seen.has(id) && e.item.isFeatured) { const p = toProduct(id, 'featured'); if (p) { products.push(p); seen.add(id) } } }

  const outCombos: FeaturedCombo[] = config.includeCombos
    ? combos.slice(0, 6).map((c) => ({
      id: String(c._id),
      name: String(c.name ?? '').slice(0, 80),
      description: c.description ? String(c.description).slice(0, 140) : null,
      price: c.priceMode === 'fixed' && Number(c.fixedPrice) > 0 ? Number(c.fixedPrice) : null,
      image: boardImageUrl(c.style?.imageUrl, 720, 720),
    }))
    : []
  return { kind: 'featured', showQr: config.showQr, style: config.style, maxItems: config.maxItems, pageMs: config.pageSeconds * 1000, brand: brandOf(tenant), products: products.slice(0, 24), combos: outCombos }
}

/** Combos de la sede vendibles ahora (activos, en horario y con todos sus productos disponibles). */
export async function sellableCombos(tenantId: unknown, locationId: unknown, menu: AnyDoc | null, timezone: string): Promise<AnyDoc[]> {
  const raw = await Combo.find({
    tenantId: new mongoose.Types.ObjectId(String(tenantId)),
    isActive: true,
    $or: [{ locationId: null }, { locationId: { $exists: false } }, { locationId: new mongoose.Types.ObjectId(String(locationId)) }],
  }).sort({ sortOrder: 1, createdAt: -1 }).limit(20).lean<AnyDoc[]>()
  if (!raw.length) return []
  const catalog = new Map<string, Record<string, any>>()
  for (const c of menu?.categories ?? []) {
    const add = (i: AnyDoc) => catalog.set(String(i._id), { _id: String(i._id), isAvailable: c.isAvailable !== false && i.isAvailable !== false, stockPortions: i.stockPortions })
    for (const i of c.items ?? []) add(i)
    for (const s of c.subcategories ?? []) for (const i of s.items ?? []) add(i)
  }
  return raw.filter((c) => isComboOnSchedule(c.availabilitySchedule, new Date(), timezone) && isComboAvailable(c as never, catalog as never))
}

export function featuredAssets(b: FeaturedBoard): string[] {
  const out = new Set<string>()
  if (b.brand.logo) out.add(b.brand.logo)
  for (const p of b.products) if (p.image) out.add(p.image)
  for (const c of b.combos) if (c.image) out.add(c.image)
  return [...out]
}
