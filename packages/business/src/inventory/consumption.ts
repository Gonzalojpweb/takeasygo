// ============================================================================
// Consumo de una línea vendida (D-04, D-07, D-08)
// ============================================================================
// Un plato vendido consume: receta (de la variante si existe, si no la del
// ítem) × porciones + efectos de los modificadores elegidos × porciones.
// Todas las cantidades se convierten a la unidad canónica del insumo; una
// unidad de otra dimensión se rechaza con warning (nunca se asume 1:1).
// ============================================================================

import type { SaleConsumptionLine, CanonicalUnit } from "@takeasygo/types"
import { convertQuantity, roundQuantity, isInventoryUnit } from "./units"

export interface ConsumptionRecipeItem {
  skuId: string
  quantity: number
  unit: string
}

export interface ConsumptionRecipe {
  id: string
  version: number
  items: ConsumptionRecipeItem[]
}

export interface ConsumptionModifierRule {
  optionName: string
  groupName: string | null
  items: ConsumptionRecipeItem[]
}

export interface SelectedModifier {
  groupName: string
  optionName: string
}

export interface SkuUnitInfo {
  canonicalUnit: CanonicalUnit
  name?: string
}

/** Minúsculas, sin acentos ni espacios repetidos: "Extra Queso " = "extra queso". */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

interface CustomizationLike {
  groupName?: string
  selectedOptions?: Array<{ name?: string; subGroups?: CustomizationLike[] }>
}

/** Aplana las customizaciones de un ítem de orden (incluye sub-grupos). */
export function flattenModifiers(groups: readonly CustomizationLike[] | null | undefined): SelectedModifier[] {
  const out: SelectedModifier[] = []
  const walk = (list: readonly CustomizationLike[] | null | undefined) => {
    for (const g of list ?? []) {
      for (const opt of g.selectedOptions ?? []) {
        if (opt.name) out.push({ groupName: g.groupName ?? "", optionName: opt.name })
        walk(opt.subGroups)
      }
    }
  }
  walk(groups)
  return out
}

export function modifierLabel(m: SelectedModifier): string {
  return m.groupName ? `${m.groupName}: ${m.optionName}` : m.optionName
}

export interface ExplodeSaleLineInput {
  portions: number
  recipe: ConsumptionRecipe | null
  modifiers: readonly SelectedModifier[]
  rules: readonly ConsumptionModifierRule[]
  skus: ReadonlyMap<string, SkuUnitInfo>
  storageLocationId: string
}

export interface ExplodeSaleLineResult {
  consumption: SaleConsumptionLine[]
  unmapped: boolean
  warnings: string[]
}

export function explodeSaleLine(input: ExplodeSaleLineInput): ExplodeSaleLineResult {
  const warnings: string[] = []
  const totals = new Map<string, number>()

  const add = (item: ConsumptionRecipeItem, factor: number, origin: string) => {
    const sku = input.skus.get(item.skuId)
    if (!sku) {
      warnings.push(`${origin}: insumo inexistente o inactivo (${item.skuId})`)
      return
    }
    if (!isInventoryUnit(item.unit)) {
      warnings.push(`${origin}: unidad inválida "${item.unit}" para ${sku.name ?? item.skuId}`)
      return
    }
    const qty = convertQuantity(item.quantity, item.unit, sku.canonicalUnit)
    if (qty === null) {
      warnings.push(`${origin}: ${item.unit} no se puede convertir a ${sku.canonicalUnit} (${sku.name ?? item.skuId})`)
      return
    }
    totals.set(item.skuId, (totals.get(item.skuId) ?? 0) + qty * factor)
  }

  if (input.recipe) {
    for (const item of input.recipe.items) add(item, input.portions, "Receta")
  }

  // Modificadores: aplican aunque el plato no tenga receta (ej. "Extra queso").
  for (const mod of input.modifiers) {
    const opt = normalizeName(mod.optionName)
    const grp = normalizeName(mod.groupName)
    const rule = input.rules.find(
      (r) => normalizeName(r.optionName) === opt && (r.groupName === null || normalizeName(r.groupName) === grp),
    )
    if (!rule) continue
    for (const item of rule.items) add(item, input.portions, `Modificador "${mod.optionName}"`)
  }

  const consumption: SaleConsumptionLine[] = []
  for (const [skuId, total] of totals) {
    const sku = input.skus.get(skuId)!
    let quantity = roundQuantity(total)
    // "Sin X" puede restar más que la receta: el plato nunca DEVUELVE insumo.
    if (input.portions > 0 && quantity < 0) {
      warnings.push(`Los modificadores dejan ${sku.name ?? skuId} en negativo; se toma 0`)
      quantity = 0
    }
    if (quantity === 0) continue
    consumption.push({ skuId, storageLocationId: input.storageLocationId, quantity, unit: sku.canonicalUnit })
  }

  return { consumption, unmapped: input.recipe === null, warnings }
}
