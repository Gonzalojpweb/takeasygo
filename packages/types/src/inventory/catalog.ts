// ============================================================================
// INVENTORY CATALOG v2 — Insumos, depósitos, recetas y modificadores
// Fuente normativa: INVENTARIO/DECISIONES_VIGENTES.md
// ============================================================================

export type SKUCategory =
  | "meat_poultry"
  | "fish_seafood"
  | "vegetables"
  | "fruits"
  | "dairy"
  | "dry_goods"
  | "beverages"
  | "packaging"
  | "other"

export const SKU_CATEGORY_LABELS: Record<SKUCategory, string> = {
  meat_poultry: "Carnes y aves",
  fish_seafood: "Pescados y mariscos",
  vegetables: "Verduras",
  fruits: "Frutas",
  dairy: "Lácteos",
  dry_goods: "Almacén",
  beverages: "Bebidas",
  packaging: "Descartables",
  other: "Otros",
}

export type CanonicalUnit = "kg" | "g" | "l" | "ml" | "unit"

export type StorageLocationType = "cold_storage" | "dry_storage" | "bar" | "kitchen" | "other"

export type BusinessImpact = "critical" | "high" | "medium" | "low"

/** raw = se compra; prepared = se produce en el local (salsa, masa, caldo). */
export type SKUKind = "raw" | "prepared"

export interface InventorySKU {
  id: string
  tenantId: string
  name: string
  skuCode?: string | null
  category: SKUCategory
  kind: SKUKind
  canonicalUnit: CanonicalUnit
  businessImpact: BusinessImpact
  /** Último precio de compra por unidad canónica (referencia). @storedAs cents */
  lastUnitCostCents: number
  /** Stock mínimo deseado (unidad canónica). null = sin alerta de reposición. */
  parLevel: number | null
  supplierName?: string | null
  isActive: boolean
}

export interface InventoryStorageLocation {
  id: string
  tenantId: string
  /** Sede (siempre requerida, D-12). */
  locationId: string
  name: string
  type: StorageLocationType
  /** Depósito del que se descuentan las ventas de la sede (uno por sede). */
  isDefaultConsumption: boolean
  isActive: boolean
}

export interface RecipeItem {
  skuId: string
  /** Cantidad por porción (plato) o por tanda (preparación). */
  quantity: number
  unit: CanonicalUnit
}

/**
 * Receta versionada e inmutable (D-08). Editar = crear versión nueva; la
 * anterior queda con isCurrent=false y las ventas viejas siguen apuntando a
 * su versión.
 *
 *  · kind "dish": consumo por porción de un ítem del menú (y opcionalmente de
 *    una variante).
 *  · kind "preparation": tanda de producción de un insumo `prepared`
 *    (inputs → outputQuantity del insumo de salida). Así se modelan las
 *    sub-recetas sin un grafo especial: el plato consume la salsa, la
 *    producción de salsa consume tomate.
 */
export interface InventoryRecipe {
  id: string
  tenantId: string
  locationId: string | null
  kind: "dish" | "preparation"
  name: string
  menuItemId: string | null
  variantName: string | null
  outputSkuId: string | null
  outputQuantity: number | null
  items: RecipeItem[]
  version: number
  isCurrent: boolean
}

/**
 * Efecto de un modificador del POS sobre el consumo ("Extra queso" +30 g de
 * mozzarella; "Sin cebolla" −20 g de cebolla). Se aplica por porción.
 */
export interface InventoryModifierRule {
  id: string
  tenantId: string
  /** Nombre de la opción tal como figura en el menú (se compara normalizado). */
  optionName: string
  /** Opcional: restringe la regla a un grupo de customización. */
  groupName: string | null
  items: RecipeItem[]
  isActive: boolean
}
