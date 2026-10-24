import { describe, it, expect } from "vitest"
import type { Product } from "@takeasygo/types"
import { searchProducts } from "../components/shared/ProductSelector"

/** Fase B (2026-10): el buscador encuentra en toda la carta sin tildes. */
const product = (name: string, category: string, description = ""): Product => ({
  id: name,
  tenantId: "t1",
  name,
  description,
  price: 1000,
  category,
  isAvailable: true,
})

const CARTA = [
  product("Milanesa napolitana", "Principales", "Con jamón y queso"),
  product("Limonada", "Bebidas"),
  product("Café con leche", "Cafetería"),
  product("Flan casero", "Postres", "Con dulce de leche"),
]

describe("searchProducts", () => {
  it("ignora tildes y mayúsculas", () => {
    expect(searchProducts(CARTA, "CAFE").map((p) => p.name)).toEqual(["Café con leche"])
  })

  it("cada palabra puede ser parcial y en cualquier orden", () => {
    expect(searchProducts(CARTA, "nap mila").map((p) => p.name)).toEqual(["Milanesa napolitana"])
  })

  it("busca también en descripción y categoría", () => {
    expect(searchProducts(CARTA, "dulce").map((p) => p.name)).toEqual(["Flan casero"])
    expect(searchProducts(CARTA, "bebidas").map((p) => p.name)).toEqual(["Limonada"])
  })

  it("texto vacío devuelve toda la carta", () => {
    expect(searchProducts(CARTA, "   ")).toHaveLength(4)
  })
})
