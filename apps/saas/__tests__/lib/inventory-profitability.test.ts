// ============================================================================
// inventory-profitability.test.ts — rentabilidad por plato (F5), lógica pura
// ============================================================================

import { describe, it, expect } from 'vitest'
import { buildProfitRows, compareLocations, profitStatus, summarize, type DishInput } from '@/lib/inventory/profitability'

const recipe = (costCents: number, missingCost = 0, usesBaseRecipe = false) => ({ costCents, missingCost, usesBaseRecipe })

function dish(over: Partial<DishInput> = {}): DishInput {
  return { menuItemId: 'm1', name: 'Hamburguesa', categoryName: 'Platos', priceCents: 1_000_000, soldLast30d: 10, base: recipe(300_000), variantStates: [], ...over }
}

describe('profitStatus', () => {
  it('clasifica por food cost con umbrales 30% / 35%', () => {
    expect(profitStatus(1000, 300, 0)).toBe('healthy')
    expect(profitStatus(1000, 320, 0)).toBe('watch')
    expect(profitStatus(1000, 360, 0)).toBe('high')
    expect(profitStatus(1000, 1000, 0)).toBe('loss')
  })
  it('sin receta, sin costo o con insumos sin precio no se da por bueno', () => {
    expect(profitStatus(1000, null, 0)).toBe('no_recipe')
    expect(profitStatus(1000, 0, 0)).toBe('incomplete')
    expect(profitStatus(1000, 200, 1)).toBe('incomplete')
    expect(profitStatus(0, 200, 0)).toBe('incomplete')
  })
})

describe('buildProfitRows', () => {
  it('plato sin variantes: margen, food cost y ganancia de 30 días', () => {
    const [r] = buildProfitRows([dish()])
    expect(r).toMatchObject({ variantName: null, costCents: 300_000, marginCents: 700_000, marginPct: 70, foodCostPct: 30, profitLast30dCents: 7_000_000, status: 'healthy' })
  })

  it('una fila por variante; «usa la base» toma el costo de la base con el precio de la variante; sin confirmar no se inventa', () => {
    const rows = buildProfitRows([
      dish({
        variantStates: [
          { name: 'Simple', priceCents: 900_000, status: 'base_confirmed', soldLast30d: 4, recipe: recipe(0, 0, true) },
          { name: 'Doble', priceCents: 1_200_000, status: 'own', soldLast30d: 2, recipe: recipe(500_000) },
          { name: 'Triple', priceCents: 1_500_000, status: 'variant_unconfirmed', soldLast30d: 1, recipe: null },
        ],
      }),
    ])
    expect(rows.map((r) => [r.variantName, r.costCents, r.status])).toEqual([
      ['Simple', 300_000, 'watch'], // 3.000 / 9.000 = 33,3%
      ['Doble', 500_000, 'high'],
      ['Triple', null, 'no_recipe'],
    ])
    expect(rows[0].priceCents).toBe(900_000)
  })

  it('si la base misma es «usa la base» (dato raro) no se toma como costo', () => {
    const [r] = buildProfitRows([dish({ base: recipe(300_000, 0, true) })])
    expect(r.status).toBe('no_recipe')
  })
})

describe('summarize', () => {
  it('margen ponderado por lo vendido, ignorando platos sin costo o incompletos', () => {
    const rows = buildProfitRows([
      dish({ menuItemId: 'a', name: 'A', priceCents: 1000, base: recipe(300), soldLast30d: 10 }), // ingreso 10000, costo 3000
      dish({ menuItemId: 'b', name: 'B', priceCents: 1000, base: recipe(500), soldLast30d: 10 }), // ingreso 10000, costo 5000
      dish({ menuItemId: 'c', name: 'C', priceCents: 1000, base: recipe(100, 2), soldLast30d: 99 }), // incompleto: fuera
      dish({ menuItemId: 'd', name: 'D', priceCents: 1000, base: null, soldLast30d: 99 }),
    ])
    const s = summarize(rows)
    expect(s).toMatchObject({ dishes: 4, costed: 2, weightedFoodCostPct: 40, weightedMarginPct: 60, profitLast30dCents: 12_000, high: 1, incomplete: 1, noRecipe: 1 })
  })
})

describe('compareLocations', () => {
  it('cruza por nombre (los ids difieren entre sedes) y ordena por diferencia de costo', () => {
    const centro = buildProfitRows([
      dish({ menuItemId: 'c-burger', name: 'Hamburguesa', base: recipe(300_000) }),
      dish({ menuItemId: 'c-salad', name: 'Ensalada', priceCents: 600_000, base: recipe(200_000) }),
      dish({ menuItemId: 'c-solo', name: 'Solo en centro', base: recipe(100_000) }),
    ])
    const norte = buildProfitRows([
      dish({ menuItemId: 'n-burger', name: 'HAMBURGUESA ', base: recipe(390_000) }),
      dish({ menuItemId: 'n-salad', name: 'Ensalada', priceCents: 600_000, base: recipe(210_000) }),
    ])
    const out = compareLocations([
      { locationId: 'L1', locationName: 'Centro', rows: centro },
      { locationId: 'L2', locationName: 'Norte', rows: norte },
    ])
    expect(out.map((r) => r.name)).toEqual(['Hamburguesa', 'Ensalada']) // «Solo en centro» no se compara
    expect(out[0]).toMatchObject({ costSpreadCents: 90_000, costSpreadPct: 30, marginSpreadPts: 9, priciestLocationId: 'L2' })
    expect(out[0].cells.map((c) => c?.locationId)).toEqual(['L1', 'L2'])
  })

  it('un plato sin receta en una sede no entra al cálculo de diferencia', () => {
    const out = compareLocations([
      { locationId: 'L1', locationName: 'A', rows: buildProfitRows([dish({ base: recipe(300_000) })]) },
      { locationId: 'L2', locationName: 'B', rows: buildProfitRows([dish({ base: null })]) },
    ])
    expect(out[0]).toMatchObject({ costSpreadCents: null, priciestLocationId: null })
    expect(out[0].cells[1]?.status).toBe('no_recipe')
  })
})
