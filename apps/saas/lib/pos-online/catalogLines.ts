// ============================================================================
// Ventas del POS con productos del catálogo comercial (multi-rubro, etapa 2)
// ============================================================================
// El POS elige la variante de un producto en el grupo «Variante» (lo arma
// lib menu-flatten) y la manda como modificador «Variante: <nombre>». Acá se
// traduce a la variante del catálogo (id estable) y se guarda en la línea del
// pedido: el pedido identifica qué se vendió y el inventario descuenta la
// existencia de esa variante. Un producto de una sola variante la toma sola.
// Para platos (sin datos de catálogo) no cambia nada.
//
// No hace falta actualizar la app del POS: todo se resuelve en el servidor
// con la carta vigente.
// ============================================================================

import type { Product, ProductCatalogInfo } from '@takeasygo/types'

const VARIANT_GROUP = 'Variante'
const VARIANT_GROUP_ALT = 'Variante del plato'

interface LineLike {
  menuItemId?: unknown
  customizations?: Array<{ selectedOptions?: Array<{ name?: string }> }>
  catalogProductId?: string
  catalogVariantId?: string
  itemKind?: 'dish' | 'product' | 'service'
}

/** Nombres de opciones elegidas en la línea («Variante: Negra», «Extra: …»). */
function optionNames(line: LineLike): string[] {
  return (line.customizations ?? []).flatMap(g => (g.selectedOptions ?? []).map(o => String(o.name ?? '')))
}

/**
 * Variante del catálogo de una línea: la única del producto, o la que
 * coincide con la opción elegida en «Variante». null si no se puede saber.
 */
export function catalogVariantForLine(line: LineLike, catalog: ProductCatalogInfo | null | undefined): string | null {
  if (!catalog) return null
  if (catalog.defaultVariantId) return catalog.defaultVariantId
  const chosen = new Set(optionNames(line))
  for (const v of catalog.variants) {
    if (chosen.has(`${VARIANT_GROUP}: ${v.name}`) || chosen.has(`${VARIANT_GROUP_ALT}: ${v.name}`) || chosen.has(v.name)) return v.variantId
  }
  return null
}

/**
 * Completa en las líneas del POS el producto y la variante del catálogo
 * (muta las líneas). Devuelve cuántas líneas se identificaron.
 */
export function withCatalogLines<T extends LineLike>(lines: T[], products: ReadonlyMap<string, Pick<Product, 'catalog'>>): number {
  let identified = 0
  for (const line of lines) {
    if (!line.menuItemId) continue
    const catalog = products.get(String(line.menuItemId))?.catalog
    if (!catalog) continue
    line.catalogProductId = catalog.productId
    line.itemKind = catalog.kind
    const variantId = catalogVariantForLine(line, catalog)
    if (variantId) {
      line.catalogVariantId = variantId
      identified++
    }
  }
  return identified
}

/** ¿Algún producto de la carta viene del catálogo? (para no cargar nada de más en restaurantes). */
export function hasCatalogProducts(products: ReadonlyMap<string, Pick<Product, 'catalog'>>): boolean {
  for (const p of products.values()) if (p.catalog) return true
  return false
}
