import { describe, it, expect } from "vitest"
import type { Product } from "@takeasygo/types"
import { catalogSearchText, findByCode, presetForVariant } from "../utils/catalog-scan"
import { searchProducts } from "../components/shared/ProductSelector"

const funda: Product = {
  id: "item-1", tenantId: "t", name: "Funda de silicona", description: "", price: 1500000, category: "Fundas", isAvailable: true,
  modifiers: [{ name: "Variante", type: "single", required: true, maxSelections: 1, priceRule: "sum", options: [{ name: "Negra", price: 0 }, { name: "Roja", price: 100000 }] }],
  catalog: {
    productId: "p1", kind: "product", defaultVariantId: null,
    variants: [
      { variantId: "v1", name: "Negra", code: "FUN-NEG", barcode: "7790000000011" },
      { variantId: "v2", name: "Roja", code: "FUN-ROJ", barcode: null },
    ],
  },
}
const cargador: Product = {
  id: "item-2", tenantId: "t", name: "Cargador 20W", description: "", price: 900000, category: "Cargadores", isAvailable: true,
  catalog: { productId: "p2", kind: "product", defaultVariantId: "v9", variants: [{ variantId: "v9", name: "", code: "CAR20", barcode: "7790000000099" }] },
}
const plato: Product = { id: "item-3", tenantId: "t", name: "Milanesa", description: "", price: 800000, category: "Principales", isAvailable: true }

describe("código de barras en el POS", () => {
  it("encuentra el producto y la variante por código de barras o código interno", () => {
    expect(findByCode([plato, funda, cargador], "7790000000011")).toEqual({ product: funda, variantName: "Negra" })
    expect(findByCode([plato, funda, cargador], " fun-rog ")).toBeNull()
    expect(findByCode([plato, funda, cargador], "fun-roj")).toEqual({ product: funda, variantName: "Roja" })
    // Una sola variante: sin variante que marcar (se agrega directo).
    expect(findByCode([plato, funda, cargador], "7790000000099")).toEqual({ product: cargador, variantName: null })
    expect(findByCode([plato], "Milanesa")).toBeNull()
  })

  it("la hoja abre con la variante del código ya marcada", () => {
    expect(presetForVariant(funda, "Roja")).toEqual({ selections: { Variante: "Roja" }, notes: "", quantity: 1 })
    expect(presetForVariant(funda, null)).toBeNull()
    expect(presetForVariant(funda, "Azul")).toBeNull()
  })

  it("la búsqueda libre también encuentra por código; los platos siguen igual", () => {
    expect(catalogSearchText(plato)).toBe("")
    expect(searchProducts([plato, funda, cargador], "car20").map((p) => p.id)).toEqual(["item-2"])
    expect(searchProducts([plato, funda, cargador], "mila").map((p) => p.id)).toEqual(["item-3"])
  })
})
