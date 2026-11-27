// ─── Línea de pedido de un producto del catálogo (multi-rubro, etapa 1) ──────
// Un ítem de la carta proyectado desde el catálogo comercial lleva
// `catalogLink`. La línea del pedido guarda el producto y la variante por
// identificador estable, así el pedido identifica lo vendido aunque cambie el
// nombre en la carta, y el inventario descuenta la existencia de esa variante.
// Para un plato (sin catalogLink) no agrega nada: la línea queda como siempre.

export interface CatalogLineFields {
  catalogProductId?: string
  catalogVariantId?: string
  itemKind?: 'product' | 'service'
}

interface MenuItemLike {
  catalogLink?: { productId?: unknown; defaultVariantId?: unknown; kind?: string | null } | null
}

export function catalogLineFields(
  menuItem: MenuItemLike | null | undefined,
  selectedVariant: { variantId?: unknown } | null | undefined,
): CatalogLineFields {
  const link = menuItem?.catalogLink
  if (!link?.productId) return {}
  const variantId = selectedVariant?.variantId ?? link.defaultVariantId ?? null
  return {
    catalogProductId: String(link.productId),
    ...(variantId ? { catalogVariantId: String(variantId) } : {}),
    itemKind: link.kind === 'service' ? 'service' : 'product',
  }
}
