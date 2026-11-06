import { describe, it, expect } from "vitest"
import { calculateItemTotal } from "@takeasygo/business/browser"
import type { OrderItem, Product } from "@takeasygo/types"
import { buildComboLines, comboWireFields, hasHalfModifiers, removeCartLine, splitCombos } from "../utils/combo"

function combo(priceMode: "fixed" | "sumItems", charge = true): Product {
  return {
    id: "c1",
    name: "2x1",
    isCombo: true,
    comboData: { id: "c1", name: "2x1", priceMode, fixedPrice: 1000_00, chargeCustomizationExtras: charge, itemPool: ["a", "b"], minItems: 2, maxItems: 2, allowRepeat: true },
  } as unknown as Product
}
const units: OrderItem[] = [
  { productId: "a", name: "Burger", quantity: 1, unitPrice: 800_00, total: 900_00, modifiers: [{ name: "Extra: Queso", price: 100_00 }] },
  { productId: "b", name: "Papas", quantity: 1, unitPrice: 500_00, total: 500_00 },
]

describe("buildComboLines", () => {
  it("precio fijo: el padre lleva el precio y los extras; los platos van en cero", () => {
    const [parent, a, b] = buildComboLines(combo("fixed"), units, "i1")
    expect(parent).toMatchObject({ productId: "c1", unitPrice: 1100_00, total: 1100_00, comboInstanceId: "i1" })
    expect(parent.comboComponent).toBeUndefined()
    expect(a).toMatchObject({ productId: "a", unitPrice: 0, total: 0, comboComponent: true, comboInstanceId: "i1" })
    expect(a.modifiers).toEqual([{ name: "Extra: Queso", price: 0, listPrice: 100_00 }])
    expect(b.modifiers).toBeUndefined()
  })

  it("suma de productos: precio de carta más extras", () => {
    expect(buildComboLines(combo("sumItems"), units, "i1")[0].total).toBe(1400_00)
  })

  it("sin cobrar extras no se suman", () => {
    expect(buildComboLines(combo("fixed", false), units, "i1")[0].total).toBe(1000_00)
  })

  it("no cuenta dos veces: el total del carrito es el precio del combo", () => {
    const lines = buildComboLines(combo("fixed"), units, "i1")
    expect(lines.reduce((s, l) => s + calculateItemTotal(l), 0)).toBe(1100_00)
  })
})

describe("carrito", () => {
  const cart = [
    { name: "suelto", comboInstanceId: undefined },
    { name: "padre", comboInstanceId: "i1" },
    { name: "plato", comboInstanceId: "i1" },
    { name: "otro combo", comboInstanceId: "i2" },
  ]

  it("borrar una línea del combo borra el combo entero", () => {
    expect(removeCartLine(cart, 2).map((l) => l.name)).toEqual(["suelto", "otro combo"])
  })

  it("una línea suelta se borra sola, y dos combos iguales no se mezclan", () => {
    expect(removeCartLine(cart, 0).map((l) => l.name)).toEqual(["padre", "plato", "otro combo"])
    expect(removeCartLine(cart, 3).map((l) => l.name)).toEqual(["suelto", "padre", "plato"])
  })
})

it("los combos no aparecen en la grilla", () => {
  const { regular, combos } = splitCombos([combo("fixed"), { id: "a", name: "Burger" } as Product])
  expect(regular.map((p) => p.id)).toEqual(["a"])
  expect(combos.map((p) => p.id)).toEqual(["c1"])
})

it("detecta mitad y mitad", () => {
  expect(hasHalfModifiers({ modifiers: [{ name: "Primera mitad: Muzza", price: 1 }] })).toBe(true)
  expect(hasHalfModifiers({ modifiers: [{ name: "Extra: Queso", price: 1 }] })).toBe(false)
})

it("una línea común no suma campos de combo", () => {
  expect(comboWireFields(units[0])).toEqual({})
})
