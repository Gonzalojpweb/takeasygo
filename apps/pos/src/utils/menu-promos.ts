import { bestMenuDiscount, menuDiscountOffered, posPromoLineDiscount } from "@takeasygo/business/browser"
import type { OrderItem, PosMenuDiscount, Product } from "@takeasygo/types"

// ============================================================================
// Promos «Descuento %» en el carrito del POS (21/11/2026)
// ============================================================================
// Misma regla que el server (@takeasygo/business/menu-discount): el plato se
// carga a precio de lista y, al crear la ronda, el server le pone a la línea
// el descuento «Promoción del local». Acá se calcula lo mismo para mostrar
// el total correcto ANTES de mandar o cobrar.
// ============================================================================

export interface CartPromo {
  cents: number
  label: string
}

/** Descuento de promo por línea del carrito (null = sin promo). */
export function cartPromoDiscounts(
  items: readonly OrderItem[],
  products: readonly Product[],
  rules: readonly PosMenuDiscount[],
  mode: "dine-in" | "takeaway",
  skip: (index: number) => boolean = () => false,
): Array<CartPromo | null> {
  if (rules.length === 0) return items.map(() => null)
  const byId = new Map(products.map((p) => [p.id, p]))
  return items.map((item, idx) => {
    if (skip(idx)) return null
    const product = byId.get(item.productId)
    const hit = posPromoLineDiscount(
      {
        productId: item.productId,
        categoryId: product?.categoryId ?? null,
        subcategoryId: product?.subcategoryId ?? null,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        modifiers: item.modifiers,
        comboComponent: item.comboComponent,
        comboInstanceId: item.comboInstanceId ?? null,
      },
      rules,
      mode,
    )
    if (!hit) return null
    return { cents: Math.min(item.total, hit.amountCents), label: `${hit.title} −${hit.percent}%` }
  })
}

/** % mayor de promo de un producto (plato o alguna variante) para la etiqueta de la grilla. */
export function productPromoPercent(
  product: Product,
  rules: readonly PosMenuDiscount[],
  mode: "dine-in" | "takeaway",
): number | null {
  if (rules.length === 0 || product.isCombo) return null
  const offered = rules.filter((r) => menuDiscountOffered(r.channels, mode))
  if (offered.length === 0) return null
  const ref = { categoryId: product.categoryId, subcategoryId: product.subcategoryId, itemId: product.id }
  const variantGroup = product.modifiers?.find((m) => m.name === "Variante" || m.name === "Variante del plato")
  const names: Array<string | null> = variantGroup ? variantGroup.options.map((o) => o.name) : [null]
  let best: number | null = null
  for (const variantName of names) {
    const hit = bestMenuDiscount(offered, { ...ref, variantName })
    if (hit && (best == null || hit.percent > best)) best = hit.percent
  }
  return best
}
