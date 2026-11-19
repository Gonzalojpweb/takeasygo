import { describe, it, expect } from "vitest"
import type { Product } from "@takeasygo/types"
import { largeOptionGroups, sectionedOptions } from "../utils/option-availability"

const flavors = Array.from({ length: 15 }, (_, i) => ({ id: `f${i}`, name: `Sabor ${i}`, price: 0, section: i < 5 ? "Chocolates" : undefined, soldOut: i === 2 }))
const product = (id: string, name: string, extra = false): Product => ({
  id, tenantId: "t", name, description: "", price: 1000, category: "Helados", isAvailable: true,
  modifiers: [
    { name: "Sabores", type: "multiple", maxSelections: 4, options: flavors },
    ...(extra ? [{ name: "Extras", options: [{ id: "x", name: "Rocklets", price: 100 }] }] : []),
  ],
})

describe("largeOptionGroups", () => {
  it("junta el grupo heredado por varios productos una sola vez", () => {
    const groups = largeOptionGroups([product("1", "Helado ¼ kg", true), product("2", "Helado ½ kg")])
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe("Sabores")
    expect(groups[0].products).toEqual(["Helado ¼ kg", "Helado ½ kg"])
    expect(groups[0].options.find((o) => o.id === "f2")?.soldOut).toBe(true)
  })

  it("ignora grupos chicos", () => {
    const small: Product = { ...product("3", "Café"), modifiers: [{ name: "Leche", options: [{ id: "a", name: "Entera", price: 0 }] }] }
    expect(largeOptionGroups([small])).toEqual([])
  })
})

describe("sectionedOptions", () => {
  it("agrupa por familia, sin familia al final, y filtra por texto", () => {
    const opts = largeOptionGroups([product("1", "x")])[0].options
    const all = sectionedOptions(opts, "")
    expect(all.map(([k]) => k)).toEqual(["Chocolates", "Otros"])
    expect(sectionedOptions(opts, "sabor 1").flatMap(([, l]) => l).map((o) => o.name)).toEqual(["Sabor 1", "Sabor 10", "Sabor 11", "Sabor 12", "Sabor 13", "Sabor 14"])
  })
})
