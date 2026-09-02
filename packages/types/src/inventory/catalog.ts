// ============================================================================
// INVENTORY CATALOG — Tipos del catálogo de inventario
// FASE04 §3.1–3.4, §3.8
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

export type CanonicalUnit = "kg" | "g" | "l" | "ml" | "unit"

export type StorageLocationType =
  | "cold_storage"
  | "dry_storage"
  | "bar"
  | "kitchen"
  | "other"

export type RecipeType = "production" | "portioning" | "cooking"

export type BusinessImpact = "critical" | "high" | "medium" | "low"

// ── Yield prior por categoría ────────────────────────────────────────────────
export interface YieldPrior {
  alpha: number
  beta: number
  source: "category_benchmark" | "restaurant_history"
}

// ── SKU / Ingrediente ────────────────────────────────────────────────────────
export interface InventorySKU {
  id: string
  tenantId: string
  name: string
  skuCode?: string
  category: SKUCategory
  canonicalUnit: CanonicalUnit
  yieldPrior: YieldPrior
  businessImpact: BusinessImpact
  /** @storedAs cents */
  lastUnitCostCents: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// ── Ubicación de almacén ─────────────────────────────────────────────────────
export interface InventoryStorageLocation {
  id: string
  tenantId: string
  locationId: string
  name: string
  type: StorageLocationType
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// ── Equivalencia de unidades ──────────────────────────────────────────────────
export interface InventoryUnitEquivalence {
  id: string
  tenantId: string
  skuId: string
  fromUnit: string
  toUnit: CanonicalUnit
  declaredFactor: number
  observedFactor?: number
  observedConfidence: number
  observationsCount: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// ── Input de receta ──────────────────────────────────────────────────────────
export interface RecipeInput {
  skuId: string
  quantity: number
  unit: CanonicalUnit
  yieldPrior: { alpha: number; beta: number }
  yieldObservedMean?: number
  yieldObservationsCount: number
}

// ── Output de receta ─────────────────────────────────────────────────────────
export interface RecipeOutput {
  skuId: string
  expectedQuantity: number
  unit: CanonicalUnit
  isPrimary: boolean
}

// ── Receta / Transformación ──────────────────────────────────────────────────
export interface InventoryRecipe {
  id: string
  tenantId: string
  name: string
  type: RecipeType
  inputs: RecipeInput[]
  outputs: RecipeOutput[]
  expectedWastePct: number
  version: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// ── Vínculo SKU ↔ Menú ──────────────────────────────────────────────────────
export interface InventorySkuMenuLink {
  id: string
  tenantId: string
  menuItemId: string
  recipeId: string
  variantOverrides?: Array<{
    variantId: string
    recipeId: string
  }>
  isActive: boolean
  confidence: number
  createdAt: Date
  updatedAt: Date
}
