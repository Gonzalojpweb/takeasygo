// ============================================================================
// Descuento % sobre la carta (promo de tipo 'discount') — 21/11/2026
// ============================================================================
// Pedido del dueño (caso Que Cachapa, «Día de la arepa»): un % de descuento
// por categoría, subcategoría, plato o VARIANTE puntual (1 sabor 40 %,
// 3 sabores 30 %…), con las mismas reglas de las promos (canal, días,
// horario, fechas, sede).
//
// Reglas (decisiones del dueño 21/11):
//   · El % va sobre el precio del plato o de la variante. Los agregados de la
//     personalización NO se descuentan: suman su precio normal.
//   · Por defecto no se acumula con Club, cupón QR, premio escondido ni
//     descuento por efectivo; el admin puede marcarla acumulable.
//   · La comisión de TakeasyGO sigue sobre el precio de lista
//     (lib/commission-base ya suma la diferencia de un plato rebajado).
//
// Prioridad:
//   · Dentro de una promo manda el objetivo más específico
//     (variante > plato > subcategoría > categoría): «30 % a toda la
//     categoría, pero 40 % a la de 1 sabor».
//   · Entre promos distintas que tocan el mismo plato gana el % más alto.
//     Nunca se suman dos descuentos de carta.
//
// Módulo puro (sin Mongo): lo usan el servidor, el menú, el carrito y el panel.
// ============================================================================

import { isOfferedInMode, isVisibleInMenu, promotionChannels, type SalesChannel } from '@/lib/sales-channels'

export const DISCOUNT_TARGET_KINDS = ['category', 'subcategory', 'item', 'variant'] as const
export type DiscountTargetKind = (typeof DISCOUNT_TARGET_KINDS)[number]

/** Tope del %: un plato a $0 no se puede cobrar con Mercado Pago. */
export const MAX_DISCOUNT_PERCENT = 95
export const MAX_DISCOUNT_TARGETS = 200

export interface MenuDiscountTarget {
  kind: DiscountTargetKind
  categoryId?: string | null
  subcategoryId?: string | null
  itemId?: string | null
  variantName?: string | null
  percent: number
}

export interface MenuDiscountPromoLike {
  _id?: unknown
  type?: string
  title?: string
  channels?: unknown
  stackable?: boolean | null
  discountTargets?: MenuDiscountTarget[] | null
}

/** Dónde está el plato que se quiere cobrar. */
export interface MenuDiscountRef {
  categoryId?: unknown
  subcategoryId?: unknown
  itemId?: unknown
  variantName?: string | null
}

export interface MenuDiscountMatch {
  promotionId: string
  title: string
  percent: number
  stackable: boolean
  channels: SalesChannel[]
}

const SPECIFICITY: Record<DiscountTargetKind, number> = { variant: 4, item: 3, subcategory: 2, category: 1 }

const idStr = (v: unknown): string => (v == null ? '' : String(v))

export function isDiscountPromo(p: { type?: string } | null | undefined): boolean {
  return p?.type === 'discount'
}

function targetMatches(t: MenuDiscountTarget, ref: MenuDiscountRef): boolean {
  switch (t.kind) {
    case 'category':
      return !!t.categoryId && idStr(t.categoryId) === idStr(ref.categoryId)
    case 'subcategory':
      return !!t.subcategoryId && idStr(t.subcategoryId) === idStr(ref.subcategoryId)
    case 'item':
      return !!t.itemId && idStr(t.itemId) === idStr(ref.itemId)
    case 'variant':
      return !!t.itemId && idStr(t.itemId) === idStr(ref.itemId) && !!ref.variantName && t.variantName === ref.variantName
    default:
      return false
  }
}

/** % de UNA promo para ese plato (objetivo más específico), o null. */
export function promoPercentFor(promo: MenuDiscountPromoLike, ref: MenuDiscountRef): number | null {
  let best: { spec: number; percent: number } | null = null
  for (const t of promo.discountTargets ?? []) {
    const pct = Number(t?.percent)
    if (!Number.isFinite(pct) || pct <= 0) continue
    if (!targetMatches(t, ref)) continue
    const spec = SPECIFICITY[t.kind] ?? 0
    if (!best || spec > best.spec || (spec === best.spec && pct > best.percent)) best = { spec, percent: pct }
  }
  return best ? Math.min(best.percent, MAX_DISCOUNT_PERCENT) : null
}

/**
 * Descuento de carta que corresponde a un plato/variante entre las promos
 * dadas (ya filtradas por sede, fechas, días y horario). Gana el % más alto.
 */
export function resolveMenuDiscount(promos: readonly MenuDiscountPromoLike[], ref: MenuDiscountRef): MenuDiscountMatch | null {
  let best: MenuDiscountMatch | null = null
  for (const p of promos) {
    if (!isDiscountPromo(p)) continue
    const percent = promoPercentFor(p, ref)
    if (percent == null) continue
    if (!best || percent > best.percent) {
      best = {
        promotionId: idStr(p._id),
        title: p.title ?? '',
        percent,
        stackable: p.stackable === true,
        channels: promotionChannels(p),
      }
    }
  }
  return best
}

/** Precio con el % aplicado. Precios en pesos enteros quedan en pesos enteros. */
export function applyPercent(cents: number, percent: number): number {
  const n = Number(cents) || 0
  if (n <= 0 || !(percent > 0)) return n
  const raw = (n * (100 - percent)) / 100
  return n % 100 === 0 ? Math.round(raw / 100) * 100 : Math.round(raw)
}

// ── Menú público: anotar precios rebajados ──────────────────────────────────

/** Lo que queda anotado en el plato (o variante) rebajado del menú. */
export interface MenuDiscountApplied extends MenuDiscountMatch {
  /** Precios de lista antes del % (centavos). */
  list: { price: number; takeawayPrice?: number; businessPrice?: number }
}

type PricedNode = {
  price?: number
  takeawayPrice?: number | null
  businessPrice?: number | null
  originalPrice?: number | null
  takeawayOriginalPrice?: number | null
  _menuDiscount?: MenuDiscountApplied
  [k: string]: unknown
}

function discountNode<T extends PricedNode>(node: T, match: MenuDiscountMatch): T {
  const price = Number(node.price) || 0
  const tk = node.takeawayPrice != null ? Number(node.takeawayPrice) : null
  const bz = node.businessPrice != null ? Number(node.businessPrice) : null
  const out: T = {
    ...node,
    price: applyPercent(price, match.percent),
    _menuDiscount: {
      ...match,
      list: {
        price,
        ...(tk != null ? { takeawayPrice: tk } : {}),
        ...(bz != null ? { businessPrice: bz } : {}),
      },
    },
  }
  if (tk != null) out.takeawayPrice = applyPercent(tk, match.percent)
  if (bz != null) out.businessPrice = applyPercent(bz, match.percent)
  // Precio de lista para el tachado (se respeta uno más alto ya cargado).
  const list = Number(node.originalPrice) || 0
  out.originalPrice = list > price ? list : price
  if (tk != null) {
    const tkList = Number(node.takeawayOriginalPrice) || 0
    out.takeawayOriginalPrice = tkList > tk ? tkList : tk
  }
  return out
}

/**
 * Devuelve una copia del menú con los precios rebajados por las promos de
 * descuento que valen en ese menú. Cada plato/variante rebajado lleva
 * `_menuDiscount` (promo, %, precios de lista). El servidor recalcula todo
 * al confirmar: esto es solo para mostrar y armar el carrito.
 */
export function applyMenuDiscounts<M extends { categories?: any[] }>(
  menu: M,
  promotions: readonly MenuDiscountPromoLike[],
  menuMode: string,
): M {
  const promos = promotions.filter((p) => isDiscountPromo(p) && isVisibleInMenu(promotionChannels(p), menuMode))
  if (promos.length === 0 || !menu?.categories) return menu

  const mapItem = (item: any, categoryId: unknown, subcategoryId: unknown) => {
    const base = { categoryId, subcategoryId, itemId: item._id }
    const variants: any[] = item.variants ?? []
    if (variants.length > 0) {
      let changed = false
      const nextVariants = variants.map((v) => {
        const m = resolveMenuDiscount(promos, { ...base, variantName: v.name })
        if (!m) return v
        changed = true
        return discountNode(v, m)
      })
      return changed ? { ...item, variants: nextVariants } : item
    }
    const m = resolveMenuDiscount(promos, base)
    return m ? discountNode(item, m) : item
  }

  return {
    ...menu,
    categories: menu.categories.map((cat: any) => ({
      ...cat,
      items: (cat.items ?? []).map((it: any) => mapItem(it, cat._id, null)),
      subcategories: (cat.subcategories ?? []).map((sub: any) => ({
        ...sub,
        items: (sub.items ?? []).map((it: any) => mapItem(it, cat._id, sub._id)),
      })),
    })),
  }
}

type MenuMode = 'takeaway' | 'dine-in' | 'business' | 'delivery' | string

function modePrice(src: { price?: number; takeawayPrice?: number | null; businessPrice?: number | null }, mode: MenuMode): number {
  if (mode === 'takeaway' || mode === 'delivery') return Number(src.takeawayPrice ?? src.price) || 0
  if (mode === 'business') return Number(src.businessPrice ?? src.price) || 0
  return Number(src.price) || 0
}

/** Descuento de carta guardado en la línea del carrito. */
export interface CartMenuDiscount {
  promotionId: string
  title: string
  percent: number
  stackable: boolean
  channels: SalesChannel[]
  /** Precio del plato/variante sin el % (centavos, en el modo del menú). */
  listBasePrice: number
  /** Precio del plato/variante con el % (centavos). */
  discountedBasePrice: number
}

/** Datos del descuento para la línea del carrito (plato o variante elegida). */
export function cartMenuDiscountFor(
  node: { _menuDiscount?: MenuDiscountApplied; price?: number; takeawayPrice?: number | null; businessPrice?: number | null } | null | undefined,
  mode: MenuMode,
): CartMenuDiscount | undefined {
  const d = node?._menuDiscount
  if (!d) return undefined
  const listBasePrice = modePrice(d.list, mode)
  const discountedBasePrice = modePrice(node!, mode)
  if (!(listBasePrice > discountedBasePrice)) return undefined
  return {
    promotionId: d.promotionId,
    title: d.title,
    percent: d.percent,
    stackable: d.stackable,
    channels: d.channels,
    listBasePrice,
    discountedBasePrice,
  }
}

/** Tachado de la tarjeta del menú: lista, con descuento y % mayor (variantes: «desde»). */
export function menuCardDiscount(item: any, mode: MenuMode): { original: number; discounted: number; percent: number; stackable: boolean } | null {
  const variants: any[] = item?.variants ?? []
  if (variants.length > 0) {
    const discounted = variants.filter((v) => v._menuDiscount)
    if (discounted.length === 0) return null
    const finalPrices = variants.map((v) => modePrice(v, mode))
    const listPrices = variants.map((v) => (v._menuDiscount ? modePrice(v._menuDiscount.list, mode) : modePrice(v, mode)))
    const min = Math.min(...finalPrices)
    const idx = finalPrices.indexOf(min)
    const percent = Math.max(...discounted.map((v) => v._menuDiscount.percent))
    const stackable = discounted.every((v) => v._menuDiscount.stackable)
    // Si la variante más barata no tiene descuento, no hay tachado: solo la etiqueta del %.
    return { original: Math.max(listPrices[idx], min), discounted: min, percent, stackable }
  }
  if (!item?._menuDiscount) return null
  const original = modePrice(item._menuDiscount.list, mode)
  const discounted = modePrice(item, mode)
  return original > discounted ? { original, discounted, percent: item._menuDiscount.percent, stackable: !!item._menuDiscount.stackable } : null
}

/**
 * Precio de la línea según la modalidad elegida en el checkout: el menú
 * online muestra lo de delivery y lo de retiro juntos, así que un descuento
 * «solo para retirar» vuelve al precio de lista si el cliente pasa a delivery.
 */
export function repriceLineForMode<L extends { type?: string; basePrice: number; extraPrice: number; price: number; menuDiscount?: CartMenuDiscount }>(line: L, mode: string): L {
  const d = line.menuDiscount
  if (!d || (line.type && line.type !== 'menuItem')) return line
  const base = isOfferedInMode(d.channels, mode) ? d.discountedBasePrice : d.listBasePrice
  if (base === line.basePrice) return line
  return { ...line, basePrice: base, price: base + (Number(line.extraPrice) || 0) }
}

/** ¿El descuento de esta línea deja afuera los otros (Club, QR, efectivo…)? */
export function blocksOtherDiscounts(line: { type?: string; menuDiscount?: CartMenuDiscount | null; basePrice?: number }): boolean {
  const d = line.menuDiscount
  return !!d && (!line.type || line.type === 'menuItem') && !d.stackable && line.basePrice === d.discountedBasePrice
}

// ── Panel: validar lo que manda el admin ────────────────────────────────────

/** Normaliza los objetivos del panel. Devuelve un mensaje de error o la lista limpia. */
export function sanitizeDiscountTargets(input: unknown): { ok: true; targets: MenuDiscountTarget[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: 'Elegí al menos una categoría, plato o variante con su % de descuento' }
  }
  if (input.length > MAX_DISCOUNT_TARGETS) return { ok: false, error: `Máximo ${MAX_DISCOUNT_TARGETS} objetivos por promoción` }
  const isId = (v: unknown) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v)
  const out: MenuDiscountTarget[] = []
  const seen = new Set<string>()
  for (const raw of input as any[]) {
    const kind = raw?.kind
    if (!(DISCOUNT_TARGET_KINDS as readonly string[]).includes(kind)) return { ok: false, error: 'Tipo de objetivo inválido' }
    const percent = Math.round(Number(raw?.percent) * 100) / 100
    if (!Number.isFinite(percent) || percent <= 0 || percent > MAX_DISCOUNT_PERCENT) {
      return { ok: false, error: `El descuento tiene que ser entre 1 % y ${MAX_DISCOUNT_PERCENT} %` }
    }
    const t: MenuDiscountTarget = { kind, percent }
    if (kind === 'category') {
      if (!isId(raw.categoryId)) return { ok: false, error: 'Categoría inválida' }
      t.categoryId = raw.categoryId
    } else if (kind === 'subcategory') {
      if (!isId(raw.subcategoryId)) return { ok: false, error: 'Subcategoría inválida' }
      t.subcategoryId = raw.subcategoryId
      if (isId(raw.categoryId)) t.categoryId = raw.categoryId
    } else {
      if (!isId(raw.itemId)) return { ok: false, error: 'Plato inválido' }
      t.itemId = raw.itemId
      if (isId(raw.categoryId)) t.categoryId = raw.categoryId
      if (isId(raw.subcategoryId)) t.subcategoryId = raw.subcategoryId
      if (kind === 'variant') {
        const name = typeof raw.variantName === 'string' ? raw.variantName.trim() : ''
        if (!name || name.length > 100) return { ok: false, error: 'Variante inválida' }
        t.variantName = name
      }
    }
    const key = `${kind}:${t.categoryId ?? ''}:${t.subcategoryId ?? ''}:${t.itemId ?? ''}:${t.variantName ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return { ok: true, targets: out }
}

/**
 * Líneas del carrito listas para POST /orders: la que cobra con descuento de
 * carta avisa con qué promo y % lo mostró (el server lo recalcula y, si ya no
 * vale, responde MENU_DISCOUNT_CHANGED en vez de cobrar otro precio).
 */
export function withMenuDiscountClaims<L extends { type?: string; basePrice?: number; menuDiscount?: CartMenuDiscount }>(lines: L[]): Array<L & { menuDiscountPromotionId?: string; menuDiscountPercent?: number }> {
  return lines.map((l) => {
    const d = l.menuDiscount
    if (!d || (l.type && l.type !== 'menuItem') || l.basePrice !== d.discountedBasePrice) return l
    return { ...l, menuDiscountPromotionId: d.promotionId, menuDiscountPercent: d.percent }
  })
}

/**
 * El menú vuelve a pedir las promos cada minuto: si un descuento de carta
 * terminó (horario, pausa, se borró), las líneas del carrito que lo usaban
 * vuelven a su precio de lista. Devuelve el mismo array si no cambió nada.
 */
export function dropExpiredMenuDiscounts<L extends { type?: string; basePrice: number; extraPrice: number; price: number; menuDiscount?: CartMenuDiscount }>(
  lines: L[],
  activePromotions: readonly MenuDiscountPromoLike[],
): L[] {
  const active = new Map<string, MenuDiscountPromoLike>()
  for (const p of activePromotions) if (isDiscountPromo(p)) active.set(idStr(p._id), p)
  let changed = false
  const next = lines.map((l) => {
    const d = l.menuDiscount
    if (!d || (l.type && l.type !== 'menuItem')) return l
    if (active.has(d.promotionId)) return l
    changed = true
    const { menuDiscount: _dropped, ...rest } = l
    return { ...rest, basePrice: d.listBasePrice, price: d.listBasePrice + (Number(l.extraPrice) || 0) } as L
  })
  return changed ? next : lines
}

/**
 * Huella de las promos de descuento: el menú vuelve a pedir las promos cada
 * minuto y solo hay que recalcular precios si cambió algún descuento.
 */
export function menuDiscountKey(promotions: readonly MenuDiscountPromoLike[]): string {
  return JSON.stringify(
    promotions
      .filter(isDiscountPromo)
      .map((p) => [idStr(p._id), p.title ?? '', p.stackable === true, promotionChannels(p), p.discountTargets ?? []]),
  )
}
