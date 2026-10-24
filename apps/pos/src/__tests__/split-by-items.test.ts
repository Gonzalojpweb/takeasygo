import { describe, it, expect } from "vitest"
import { expandUnits, totalsByPerson } from "../components/shared/SplitByItems"

/** Fase D (2026-10): dividir por platos — la suma siempre es el total exacto. */
describe("expandUnits", () => {
  it("abre cada plato en unidades y reparte los centavos sobrantes", () => {
    const units = expandUnits([{ key: "a", name: "Empanada", quantity: 3, total: 1000 }])
    expect(units.map((u) => u.amount)).toEqual([334, 333, 333])
    expect(units.reduce((s, u) => s + u.amount, 0)).toBe(1000)
  })
})

describe("totalsByPerson", () => {
  it("suma por persona lo asignado; lo no asignado no cuenta", () => {
    const units = expandUnits([
      { key: "a", name: "Bife", quantity: 1, total: 9000 },
      { key: "b", name: "Agua", quantity: 2, total: 2000 },
    ])
    const totals = totalsByPerson(units, { "a#0": 0, "b#0": 0, "b#1": 1 }, 2)
    expect(totals).toEqual([10000, 1000])
    expect(totalsByPerson(units, { "a#0": 1 }, 2)).toEqual([0, 9000])
  })
})
