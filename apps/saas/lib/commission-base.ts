// ============================================================================
// Base de la comisión de TakeasyGO a precio de LISTA (20/11/2026)
// ============================================================================
// REGLA del dueño, clave: la comisión de TakeasyGO se calcula SIEMPRE sobre el
// precio full de lista de cada ítem. Ningún descuento o promo del comercio la
// baja: precio de promo, combo más barato, descuento de categoría, cupón QR,
// Club, descuento por efectivo o por medio de pago. Tampoco un premio
// canjeado con puntos (va a $0 en el pedido pero comisiona por su valor).
//
// Este módulo suma el precio de lista de los productos de un pedido (sin
// envío). lib/pricing usa esa suma como piso de la base de la comisión.
// ============================================================================

type Priced = {
  price?: number | null
  takeawayPrice?: number | null
  businessPrice?: number | null
  originalPrice?: number | null
  takeawayOriginalPrice?: number | null
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

/** Precio de lista (antes de descuentos de categoría) de un plato o variante en el modo del pedido. */
export function listUnitPrice(src: Priced | null | undefined, mode: string | null | undefined): number {
  if (!src) return 0
  if (mode === 'takeaway' || mode === 'delivery') {
    return n(src.takeawayOriginalPrice) || n(src.takeawayPrice) || n(src.originalPrice) || n(src.price)
  }
  // 23/11/2026: salón sin precio propio (quedó en 0) → el de para llevar
  // (lib: @takeasygo/business/menu-price, la misma regla con la que se cobra).
  const salon = n(src.originalPrice) || n(src.price) || n(src.takeawayOriginalPrice) || n(src.takeawayPrice)
  if (mode === 'business') return n(src.businessPrice) || salon
  return salon
}

type Option = { extraPrice?: number | null; quantity?: number | null; subOptions?: Option[]; selectedSubOptions?: Option[] }
type Customization = { selectedOptions?: Option[] }

/** Extras de la personalización a precio de carta (aunque la promo los incluya gratis). */
export function customizationListExtras(customizations: Customization[] | null | undefined): number {
  let total = 0
  const walk = (opts: Option[] | undefined) => {
    for (const o of opts ?? []) {
      total += n(o.extraPrice) * (n(o.quantity) || 1)
      walk(o.subOptions)
      walk(o.selectedSubOptions)
    }
  }
  for (const c of customizations ?? []) walk(c.selectedOptions)
  return total
}

export interface ListLine {
  itemType?: string | null
  menuItemId?: unknown
  promotionId?: unknown
  storeItemId?: unknown
  comboComponent?: boolean
  quantity?: number | null
  basePrice?: number | null
  extraPrice?: number | null
  subtotal?: number | null
  selectedVariant?: { name?: string } | null
  customizations?: Customization[]
}

export interface ListContext {
  mode: string | null | undefined
  /** menuItemId → plato de la carta (con variants) */
  menuItems: Map<string, Priced & { variants?: Array<Priced & { name?: string }> }>
  /** promotionId → promo (originalPrice para promos sin pasos) */
  promotions?: Map<string, { originalPrice?: number | null; price?: number | null }>
  /** storeItemId → valor en pesos del premio (cashValue) */
  rewardValues?: Map<string, number>
}

function listOfMenuUnit(line: ListLine, ctx: ListContext): number | null {
  const item = line.menuItemId != null ? ctx.menuItems.get(String(line.menuItemId)) : undefined
  if (!item) return null
  const variant = line.selectedVariant?.name ? item.variants?.find((v) => v.name === line.selectedVariant!.name) : undefined
  return listUnitPrice(variant ?? item, ctx.mode)
}

/** Precio de lista de una línea del pedido (cantidad incluida). */
export function lineListTotal(line: ListLine, ctx: ListContext): number {
  const qty = n(line.quantity) || 1
  const charged = n(line.subtotal)

  // Línea padre de un combo: sus platos se cuentan uno por uno.
  if (line.itemType === 'combo') return 0

  if (line.itemType === 'reward') {
    const value = line.storeItemId != null ? ctx.rewardValues?.get(String(line.storeItemId)) ?? 0 : 0
    return Math.max(charged, n(value) * qty)
  }

  const unit = listOfMenuUnit(line, ctx)

  // Plato de un combo o de una promo: precio de carta + extras a precio de
  // carta. Sin comparar por línea: el precio de la promo se reparte entre sus
  // platos de forma pareja; el piso «nunca menos que lo cobrado» va al total.
  if (line.comboComponent || line.itemType === 'promotion') {
    if (unit != null) {
      return (unit + Math.max(n(line.extraPrice), customizationListExtras(line.customizations))) * qty
    }
    // Promo sin pasos (1 línea = 1 combo): su precio original declarado.
    const promo = line.promotionId != null ? ctx.promotions?.get(String(line.promotionId)) : undefined
    return Math.max(charged, n(promo?.originalPrice) * qty)
  }

  // Plato suelto: lo cobrado ya es precio de carta salvo descuento de
  // categoría (precio rebajado con originalPrice de lista). Mitad y mitad
  // (basePrice 0) se cobra a precio pleno: queda lo cobrado.
  if (unit != null && n(line.basePrice) > 0 && unit > n(line.basePrice)) {
    return charged + (unit - n(line.basePrice)) * qty
  }
  return charged
}

/** Suma a precio de lista de los productos del pedido (nunca menos que lo cobrado). */
export function productsListTotal(lines: ListLine[], ctx: ListContext): number {
  const list = lines.reduce((sum, l) => sum + lineListTotal(l, ctx), 0)
  const charged = lines.reduce((sum, l) => sum + n(l.subtotal), 0)
  return Math.round(Math.max(list, charged))
}
