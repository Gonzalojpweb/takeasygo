import { describe, it, expect } from "vitest"
import type { Product } from "@takeasygo/types"
import {
  HALF_FIRST,
  HALF_GROUP_KEY,
  HALF_MODE,
  HALF_SECOND,
  HALF_TYPE,
  buildOrderItem,
  initialSelections,
  isGroupDone,
  pendingGroup,
  selectionsFromItem,
  toggleOption,
  unitTotal,
  visibleGroups,
  type Selections,
} from "../utils/product-config"

// Hoja de personalización (obs. UX 30/10): la línea del pedido tiene que
// salir EXACTAMENTE como la valida el server (catalogPrices.ts).

const bife: Product = {
  id: "bife", tenantId: "t", name: "Bife de chorizo", description: "", price: 18500, category: "Principales", isAvailable: true,
  modifiers: [
    { name: "Punto", type: "single", required: true, options: [{ name: "Jugoso", price: 0 }, { name: "A punto", price: 0 }] },
    {
      name: "Guarnición", type: "single", required: true,
      options: [
        { name: "Papas", price: 0 },
        { name: "Ensalada", price: 500, subGroups: [{ name: "Aderezo", type: "single", required: true, options: [{ name: "Limón", price: 0 }, { name: "Mostaza", price: 200 }] }] },
      ],
    },
    { name: "Extras", type: "multiple", maxSelections: 2, options: [{ name: "Huevo", price: 900 }, { name: "Provoleta", price: 2800 }, { name: "Chimichurri", price: 0 }] },
  ],
}

const half = (name: string, halfPrice: number): Product => ({
  id: name, tenantId: "t", name, description: "", price: 14000, halfPrice, category: "Pizzas", isAvailable: true,
  modifiers: [
    { name: HALF_TYPE, type: "single", required: true, options: [{ name: "Un sabor", price: 0 }, { name: HALF_MODE, price: 0 }] },
    { name: HALF_FIRST, type: "single", required: true, options: [{ name: "Muzza", price: 6500 }, { name: "Napo", price: 7200 }] },
    { name: HALF_SECOND, type: "single", required: true, options: [{ name: "Muzza", price: 6500 }, { name: "Napo", price: 7200 }] },
    { name: "Masa", type: "single", required: true, options: [{ name: "Piedra", price: 0 }, { name: "Integral", price: 900 }] },
  ],
})
const pizza = half("Muzza", 6500)

function pick(product: Product, sel: Selections, key: string, option: string): Selections {
  const g = visibleGroups(product, sel).find((x) => x.key === key)
  if (!g) throw new Error(`grupo ${key} no visible`)
  return toggleOption(sel, g, option)
}

describe("hoja de personalización — grupos y pendientes", () => {
  it("falta lo obligatorio, en orden", () => {
    let sel: Selections = {}
    expect(pendingGroup(visibleGroups(bife, sel), sel)?.name).toBe("Punto")
    sel = pick(bife, sel, "Punto", "Jugoso")
    expect(pendingGroup(visibleGroups(bife, sel), sel)?.name).toBe("Guarnición")
    sel = pick(bife, sel, "Guarnición", "Papas")
    expect(pendingGroup(visibleGroups(bife, sel), sel)).toBeNull()
  })

  it("una opción con subgrupo lo destapa y lo vuelve obligatorio", () => {
    let sel = pick(bife, pick(bife, {}, "Punto", "Jugoso"), "Guarnición", "Ensalada")
    const groups = visibleGroups(bife, sel)
    const sub = groups.find((g) => g.name === "Aderezo")!
    expect(sub.parentLabel).toBe("Ensalada")
    expect(pendingGroup(groups, sel)?.name).toBe("Aderezo")
    sel = pick(bife, sel, sub.key, "Mostaza")
    expect(isGroupDone(sel, sub)).toBe(true)
    expect(unitTotal(bife, sel)).toBe(18500 + 500 + 200)
  })

  it("multi respeta el tope", () => {
    let sel: Selections = {}
    sel = pick(bife, sel, "Extras", "Huevo")
    sel = pick(bife, sel, "Extras", "Provoleta")
    sel = pick(bife, sel, "Extras", "Chimichurri")
    expect(sel.Extras).toEqual(["Huevo", "Provoleta"])
    sel = pick(bife, sel, "Extras", "Huevo")
    expect(sel.Extras).toEqual(["Provoleta"])
  })
})

describe("hoja de personalización — línea del pedido (contrato con el server)", () => {
  it("normal: unitPrice = precio base; un modificador por opción; total con extras", () => {
    let sel: Selections = {}
    sel = pick(bife, sel, "Punto", "A punto")
    sel = pick(bife, sel, "Guarnición", "Ensalada")
    sel = pick(bife, sel, "Guarnición›Ensalada›Aderezo", "Limón")
    sel = pick(bife, sel, "Extras", "Huevo")
    const item = buildOrderItem(bife, sel, "  Sin sal ", 2)
    expect(item.unitPrice).toBe(18500)
    expect(item.modifiers).toEqual([
      { name: "Punto: A punto", price: 0 },
      { name: "Guarnición: Ensalada", price: 500 },
      { name: "Aderezo: Limón", price: 0 },
      { name: "Extras: Huevo", price: 900 },
    ])
    expect(item.total).toBe((18500 + 500 + 900) * 2)
    expect(item.notes).toBe("Sin sal")
  })

  it("mitad y mitad: suma de mitades, solo dos modificadores y sin extras", () => {
    let sel = initialSelections(pizza)
    expect(sel[HALF_TYPE]).toBe("Un sabor")
    sel = pick(pizza, sel, "Masa", "Integral")
    sel = pick(pizza, sel, HALF_TYPE, HALF_MODE)
    expect(sel.Masa).toBeUndefined()
    const groups = visibleGroups(pizza, sel)
    expect(groups.map((g) => g.key)).toEqual([HALF_TYPE, HALF_GROUP_KEY])
    expect(pendingGroup(groups, sel)?.key).toBe(HALF_GROUP_KEY)
    sel = { ...sel, [HALF_FIRST]: "Muzza", [HALF_SECOND]: "Napo" }
    expect(pendingGroup(visibleGroups(pizza, sel), sel)).toBeNull()
    const item = buildOrderItem(pizza, sel, "", 1)
    expect(item).toMatchObject({ name: "Muzza Mitad y mitad", unitPrice: 13700, total: 13700 })
    expect(item.modifiers).toEqual([
      { name: "Primera mitad: Muzza", price: 6500 },
      { name: "Segunda mitad: Napo", price: 7200 },
    ])
  })

  it("un sabor: precio normal y sin modificadores sintéticos", () => {
    const sel = pick(pizza, initialSelections(pizza), "Masa", "Piedra")
    const item = buildOrderItem(pizza, sel, "", 1)
    expect(item.unitPrice).toBe(14000)
    expect(item.modifiers).toEqual([{ name: "Masa: Piedra", price: 0 }])
  })
})

describe("editar una línea: selectionsFromItem", () => {
  it("vuelve a armar lo elegido, subgrupos incluidos", () => {
    let sel: Selections = {}
    sel = pick(bife, sel, "Punto", "Jugoso")
    sel = pick(bife, sel, "Guarnición", "Ensalada")
    sel = pick(bife, sel, "Guarnición›Ensalada›Aderezo", "Mostaza")
    sel = pick(bife, sel, "Extras", "Provoleta")
    const back = selectionsFromItem(bife, buildOrderItem(bife, sel, "", 1))
    expect(buildOrderItem(bife, back, "", 1)).toEqual(buildOrderItem(bife, sel, "", 1))
  })

  it("mitad y mitad", () => {
    const sel: Selections = { [HALF_TYPE]: HALF_MODE, [HALF_FIRST]: "Napo", [HALF_SECOND]: "Muzza" }
    expect(selectionsFromItem(pizza, buildOrderItem(pizza, sel, "", 1))).toEqual(sel)
  })
})
