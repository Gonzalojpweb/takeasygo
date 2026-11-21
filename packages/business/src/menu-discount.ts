// ============================================================================
// Descuento % de carta (promo type 'discount') — regla ÚNICA SaaS ⇄ POS
// ============================================================================
// 21/11/2026 (caso Que Cachapa): % por categoría, subcategoría, plato o
// variante. El menú online, POST /orders, el POS y su server calculan con
// estas mismas funciones: mismo plato, mismo precio.
//
//   · Dentro de una promo manda el objetivo más específico
//     (variante > plato > subcategoría > categoría).
//   · Entre promos distintas gana el % más alto (nunca se suman).
//   · El % va sobre el precio del plato o de la variante; los agregados de la
//     personalización suman su precio normal.
//   · Precios en pesos enteros quedan en pesos enteros.
//
// Puro: sin Mongo ni DOM. `channels` llega ya normalizado ([] = todos).
// ============================================================================

export const DISCOUNT_TARGET_KINDS = ['category', 'subcategory', 'item', 'variant'] as const
export type DiscountTargetKind = (typeof DISCOUNT_TARGET_KINDS)[number]

/** Tope del %: un plato a $0 no se puede cobrar con Mercado Pago. */
export const MAX_DISCOUNT_PERCENT = 95

export interface MenuDiscountTarget {
  kind: DiscountTargetKind
  categoryId?: string | null
  subcategoryId?: string | null
  itemId?: string | null
  variantName?: string | null
  percent: number
}

export interface MenuDiscountRule {
  _id?: unknown
  type?: string
  title?: string
  /** Canales donde vale ([] = todos): 'delivery' | 'takeaway' | 'dine-in'. */
  channels?: readonly string[] | null
  stackable?: boolean | null
  discountTargets?: readonly MenuDiscountTarget[] | null
}

export interface MenuDiscountRef {
  categoryId?: unknown
  subcategoryId?: unknown
  itemId?: unknown
  variantName?: string | null
}

export interface MenuDiscountHit {
  promotionId: string
  title: string
  percent: number
  stackable: boolean
  channels: string[]
}

const SPECIFICITY: Record<DiscountTargetKind, number> = { variant: 4, item: 3, subcategory: 2, category: 1 }

const idStr = (v: unknown): string => (v == null ? '' : String(v))

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
export function menuDiscountPercentFor(rule: MenuDiscountRule, ref: MenuDiscountRef): number | null {
  let best: { spec: number; percent: number } | null = null
  for (const t of rule.discountTargets ?? []) {
    const pct = Number(t?.percent)
    if (!Number.isFinite(pct) || pct <= 0) continue
    if (!targetMatches(t, ref)) continue
    const spec = SPECIFICITY[t.kind] ?? 0
    if (!best || spec > best.spec || (spec === best.spec && pct > best.percent)) best = { spec, percent: pct }
  }
  return best ? Math.min(best.percent, MAX_DISCOUNT_PERCENT) : null
}

/** El descuento que le toca a un plato/variante entre varias promos (gana el mayor %). */
export function bestMenuDiscount(rules: readonly MenuDiscountRule[], ref: MenuDiscountRef): MenuDiscountHit | null {
  let best: MenuDiscountHit | null = null
  for (const r of rules) {
    if (r.type !== 'discount') continue
    const percent = menuDiscountPercentFor(r, ref)
    if (percent == null) continue
    if (!best || percent > best.percent) {
      best = {
        promotionId: idStr(r._id),
        title: r.title ?? '',
        percent,
        stackable: r.stackable === true,
        channels: [...(r.channels ?? [])],
      }
    }
  }
  return best
}

/** Precio con el % aplicado (centavos). */
export function applyDiscountPercent(cents: number, percent: number): number {
  const n = Number(cents) || 0
  if (n <= 0 || !(percent > 0)) return n
  const raw = (n * (100 - percent)) / 100
  return n % 100 === 0 ? Math.round(raw / 100) * 100 : Math.round(raw)
}

/** ¿La promo vale en este modo de pedido? ([] = todos los canales.) */
export function menuDiscountOffered(channels: readonly string[] | null | undefined, mode: string | null | undefined): boolean {
  if (!channels || channels.length === 0) return true
  return !!mode && channels.includes(mode)
}

// ── POS ─────────────────────────────────────────────────────────────────────
// El POS vende el plato a precio de lista y la promo entra como DESCUENTO DE
// LA LÍNEA (motivo «Promoción del local»): así el cobro, la factura, el Z y
// los reportes la leen sin lógica nueva. El server y el POS calculan el
// descuento con esta función.

/** Prefijos de la variante en los modificadores del POS (menu-flatten). */
const VARIANT_PREFIXES = ['Variante: ', 'Variante del plato: ']
const HALF_PREFIXES = ['Primera mitad: ', 'Segunda mitad: ']

/** Marca de la línea con descuento de promo (campo `by` del descuento). */
export const POS_PROMO_DISCOUNT_BY_PREFIX = 'promo:'

export interface PosPromoLineInput {
  productId: string
  categoryId?: string | null
  subcategoryId?: string | null
  /** Precio base del producto (variante más barata si tiene variantes). */
  unitPrice: number
  quantity: number
  modifiers?: ReadonlyArray<{ name: string; price: number }>
  comboComponent?: boolean
  comboInstanceId?: string | null
}

export interface PosPromoLineDiscount extends MenuDiscountHit {
  /** Centavos descontados por unidad (solo plato/variante, sin agregados). */
  perUnitCents: number
  /** perUnitCents × cantidad. */
  amountCents: number
}

/** Descuento de promo de una línea del POS, o null. */
export function posPromoLineDiscount(
  line: PosPromoLineInput,
  rules: readonly MenuDiscountRule[],
  orderMode: string,
): PosPromoLineDiscount | null {
  if (rules.length === 0 || line.comboComponent || line.comboInstanceId) return null
  const mods = line.modifiers ?? []
  if (mods.some((m) => HALF_PREFIXES.some((p) => m.name.startsWith(p)))) return null
  let variantName: string | null = null
  let variantDelta = 0
  for (const m of mods) {
    const prefix = VARIANT_PREFIXES.find((p) => m.name.startsWith(p))
    if (prefix) {
      variantName = m.name.slice(prefix.length)
      variantDelta = Number(m.price) || 0
      break
    }
  }
  const offered = rules.filter((r) => menuDiscountOffered(r.channels, orderMode))
  const hit = bestMenuDiscount(offered, {
    categoryId: line.categoryId,
    subcategoryId: line.subcategoryId,
    itemId: line.productId,
    variantName,
  })
  if (!hit) return null
  const base = (Number(line.unitPrice) || 0) + variantDelta
  const perUnitCents = base - applyDiscountPercent(base, hit.percent)
  if (perUnitCents <= 0) return null
  return { ...hit, perUnitCents, amountCents: perUnitCents * Math.max(0, line.quantity) }
}
