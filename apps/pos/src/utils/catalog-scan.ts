// ============================================================================
// Búsqueda por código y código de barras (multi-rubro, etapa 2)
// ============================================================================
// Un lector de código de barras funciona como un teclado: escribe el código y
// manda Enter. El buscador del POS ya toma el foco al teclear; acá se resuelve
// a qué producto (y variante) corresponde un código exacto. Los platos no
// tienen código: para ellos no cambia nada.
// ============================================================================

import type { Product } from "@takeasygo/types"
import type { ProductConfigDraft } from "../components/shared/ProductConfigSheet"

const VARIANT_GROUPS = ["Variante", "Variante del plato"]

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "")
}

export interface CodeMatch {
  product: Product
  /** Variante del código (null = producto de una sola variante). */
  variantName: string | null
}

/** Producto y variante de un código interno o de barras exacto. */
export function findByCode(products: readonly Product[], raw: string): CodeMatch | null {
  const code = normalizeCode(raw)
  if (code.length < 2) return null
  for (const product of products) {
    const catalog = product.catalog
    if (!catalog) continue
    for (const v of catalog.variants) {
      const hit = normalizeCode(v.code) === code || (v.barcode ? normalizeCode(v.barcode) === code : false)
      if (hit) return { product, variantName: catalog.defaultVariantId ? null : v.name }
    }
  }
  return null
}

/** Texto extra para la búsqueda libre: códigos y códigos de barras del producto. */
export function catalogSearchText(product: Product): string {
  return (product.catalog?.variants ?? []).map((v) => `${v.code} ${v.barcode ?? ""}`).join(" ")
}

/**
 * Selección inicial de la hoja de opciones con la variante del código ya
 * marcada (el cajero solo confirma). null si no hay variante que marcar.
 */
export function presetForVariant(product: Product, variantName: string | null): ProductConfigDraft | null {
  if (!variantName) return null
  const group = (product.modifiers ?? []).find((g) => VARIANT_GROUPS.includes(g.name) && g.options.some((o) => o.name === variantName))
  if (!group) return null
  return { selections: { [group.name]: variantName }, notes: "", quantity: 1 }
}
