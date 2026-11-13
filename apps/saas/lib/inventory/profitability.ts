// ============================================================================
// Rentabilidad por plato (F5) — lógica pura
// ============================================================================
// Transforma la vista de recetas de una sede (loadRecipesView) en filas de
// rentabilidad: precio, costo teórico, margen, food cost y ganancia aportada
// en los últimos 30 días. También arma la comparación del MISMO plato entre
// sedes (el costo cambia por sede porque el costo promedio de cada insumo es
// de su depósito).
//
// Sin acceso a DB: se prueba con datos armados a mano.
// ============================================================================

import { normalizeName } from '@takeasygo/business/inventory'

/** Food cost (costo / precio) a partir del cual el plato se marca. */
export const FOOD_COST_WATCH_PCT = 30
export const FOOD_COST_HIGH_PCT = 35

export type ProfitStatus = 'healthy' | 'watch' | 'high' | 'loss' | 'incomplete' | 'no_recipe'

/** Lo mínimo que se necesita de la vista de recetas (subconjunto de DishView). */
export interface RecipeCostInput {
  costCents: number
  missingCost: number
  usesBaseRecipe?: boolean
}
export interface DishInput {
  menuItemId: string
  name: string
  categoryName: string
  priceCents: number
  soldLast30d: number
  base: RecipeCostInput | null
  variantStates: Array<{ name: string; priceCents: number; status: string; soldLast30d: number; recipe: RecipeCostInput | null }>
}

export interface ProfitRow {
  /** Clave estable entre sedes: nombre normalizado + variante. */
  key: string
  menuItemId: string
  name: string
  variantName: string | null
  categoryName: string
  priceCents: number
  /** null = sin receta (no se puede costear). */
  costCents: number | null
  marginCents: number | null
  marginPct: number | null
  foodCostPct: number | null
  /** Insumos de la receta sin costo cargado: el costo está subestimado. */
  missingCost: number
  soldLast30d: number
  /** Margen × vendidos en 30 días. */
  profitLast30dCents: number | null
  status: ProfitStatus
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function profitStatus(priceCents: number, costCents: number | null, missingCost: number): ProfitStatus {
  if (costCents === null) return 'no_recipe'
  if (missingCost > 0 || costCents <= 0) return 'incomplete'
  if (priceCents <= 0) return 'incomplete'
  if (costCents >= priceCents) return 'loss'
  const pct = (costCents / priceCents) * 100
  if (pct > FOOD_COST_HIGH_PCT) return 'high'
  if (pct > FOOD_COST_WATCH_PCT) return 'watch'
  return 'healthy'
}

export function rowKey(name: string, variantName: string | null): string {
  return `${normalizeName(name)}|${variantName ? normalizeName(variantName) : ''}`
}

function buildRow(
  dish: DishInput,
  variantName: string | null,
  priceCents: number,
  recipe: RecipeCostInput | null,
  soldLast30d: number,
): ProfitRow {
  const costCents = recipe ? recipe.costCents : null
  const missingCost = recipe?.missingCost ?? 0
  const status = profitStatus(priceCents, costCents, missingCost)
  const costed = costCents !== null && costCents > 0 && priceCents > 0
  const marginCents = costed ? priceCents - costCents! : null
  return {
    key: rowKey(dish.name, variantName),
    menuItemId: dish.menuItemId,
    name: dish.name,
    variantName,
    categoryName: dish.categoryName,
    priceCents,
    costCents,
    marginCents,
    marginPct: costed ? round1((marginCents! / priceCents) * 100) : null,
    foodCostPct: costed ? round1((costCents! / priceCents) * 100) : null,
    missingCost,
    soldLast30d,
    profitLast30dCents: marginCents !== null ? marginCents * soldLast30d : null,
    status,
  }
}

/**
 * Una fila por plato sin variantes, o una por variante (cada variante tiene su
 * precio). Variante que usa la receta base (D-26) → costo de la base con el
 * precio de la variante. Variante sin confirmar → sin receta (no se inventa).
 */
export function buildProfitRows(dishes: DishInput[]): ProfitRow[] {
  const rows: ProfitRow[] = []
  for (const d of dishes) {
    const ownBase = d.base && !d.base.usesBaseRecipe ? d.base : null
    if (d.variantStates.length === 0) {
      rows.push(buildRow(d, null, d.priceCents, ownBase, d.soldLast30d))
      continue
    }
    for (const v of d.variantStates) {
      let recipe: RecipeCostInput | null = null
      if (v.status === 'own' && v.recipe && !v.recipe.usesBaseRecipe) recipe = v.recipe
      else if (v.status === 'base_confirmed') recipe = ownBase
      rows.push(buildRow(d, v.name, v.priceCents || d.priceCents, recipe, v.soldLast30d))
    }
  }
  return rows
}

export interface ProfitSummary {
  dishes: number
  costed: number
  /** Margen ponderado por lo vendido en 30 días (solo platos costeados). */
  weightedMarginPct: number | null
  /** Food cost ponderado por lo vendido en 30 días. */
  weightedFoodCostPct: number | null
  profitLast30dCents: number
  revenueCostedLast30dCents: number
  high: number
  loss: number
  incomplete: number
  noRecipe: number
}

export function summarize(rows: ProfitRow[]): ProfitSummary {
  let revenue = 0
  let cost = 0
  let profit = 0
  const count = (s: ProfitStatus) => rows.filter((r) => r.status === s).length
  for (const r of rows) {
    if (r.costCents === null || r.marginCents === null || r.status === 'incomplete') continue
    revenue += r.priceCents * r.soldLast30d
    cost += r.costCents * r.soldLast30d
    profit += r.marginCents * r.soldLast30d
  }
  return {
    dishes: rows.length,
    costed: rows.filter((r) => r.marginCents !== null && r.status !== 'incomplete').length,
    weightedMarginPct: revenue > 0 ? round1(((revenue - cost) / revenue) * 100) : null,
    weightedFoodCostPct: revenue > 0 ? round1((cost / revenue) * 100) : null,
    profitLast30dCents: profit,
    revenueCostedLast30dCents: revenue,
    high: count('high'),
    loss: count('loss'),
    incomplete: count('incomplete'),
    noRecipe: count('no_recipe'),
  }
}

// ---------------------------------------------------------------------------
// Comparación entre sedes
// ---------------------------------------------------------------------------

export interface LocationRows {
  locationId: string
  locationName: string
  rows: ProfitRow[]
}

export interface CompareCell {
  locationId: string
  priceCents: number
  costCents: number | null
  marginPct: number | null
  soldLast30d: number
  status: ProfitStatus
}

export interface CompareRow {
  key: string
  name: string
  variantName: string | null
  categoryName: string
  /** Una celda por sede, en el orden de `locations` (null = el plato no está en esa sede). */
  cells: Array<CompareCell | null>
  /** Diferencia de costo entre la sede más cara y la más barata (solo costeadas). */
  costSpreadCents: number | null
  costSpreadPct: number | null
  /** Diferencia de margen % entre la mejor y la peor sede. */
  marginSpreadPts: number | null
  /** Sede con el costo más alto (si hay al menos 2 costeadas). */
  priciestLocationId: string | null
}

/**
 * Cruza las filas de cada sede por nombre de plato + variante (las cartas son
 * por sede y los ids de plato no coinciden entre sedes). Solo platos que están
 * en 2 o más sedes, ordenados por la mayor diferencia de costo.
 */
export function compareLocations(locations: LocationRows[]): CompareRow[] {
  const byKey = new Map<string, { sample: ProfitRow; cells: Map<string, CompareCell> }>()
  for (const loc of locations) {
    for (const r of loc.rows) {
      const entry = byKey.get(r.key) ?? { sample: r, cells: new Map<string, CompareCell>() }
      if (!entry.cells.has(loc.locationId)) {
        entry.cells.set(loc.locationId, {
          locationId: loc.locationId,
          priceCents: r.priceCents,
          costCents: r.costCents,
          marginPct: r.marginPct,
          soldLast30d: r.soldLast30d,
          status: r.status,
        })
      }
      byKey.set(r.key, entry)
    }
  }

  const out: CompareRow[] = []
  for (const [key, { sample, cells }] of byKey) {
    if (cells.size < 2) continue
    const costed = [...cells.values()].filter((c) => c.costCents !== null && c.costCents > 0 && c.status !== 'incomplete')
    let costSpreadCents: number | null = null
    let costSpreadPct: number | null = null
    let marginSpreadPts: number | null = null
    let priciestLocationId: string | null = null
    if (costed.length >= 2) {
      const sorted = [...costed].sort((a, b) => a.costCents! - b.costCents!)
      const min = sorted[0]
      const max = sorted[sorted.length - 1]
      costSpreadCents = max.costCents! - min.costCents!
      costSpreadPct = round1((costSpreadCents / min.costCents!) * 100)
      priciestLocationId = costSpreadCents > 0 ? max.locationId : null
      const margins = costed.map((c) => c.marginPct).filter((m): m is number => m !== null)
      if (margins.length >= 2) marginSpreadPts = round1(Math.max(...margins) - Math.min(...margins))
    }
    out.push({
      key,
      name: sample.name,
      variantName: sample.variantName,
      categoryName: sample.categoryName,
      cells: locations.map((l) => cells.get(l.locationId) ?? null),
      costSpreadCents,
      costSpreadPct,
      marginSpreadPts,
      priciestLocationId,
    })
  }
  out.sort((a, b) => (b.costSpreadPct ?? -1) - (a.costSpreadPct ?? -1) || a.name.localeCompare(b.name, 'es'))
  return out
}
