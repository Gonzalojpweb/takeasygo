// ============================================================================
// Inventario V3 — contratos de las respuestas de la API (lo que la UI usa)
// ============================================================================

import type { InventorySetupStatus } from '@/lib/inventory/catalog'
import type { DishRecipeStatus } from '@takeasygo/business/inventory'

export type SetupStatus = InventorySetupStatus

export interface Capabilities {
  read: boolean
  capture: boolean
  recipes: boolean
  manage: boolean
}

export interface LocationOption {
  id: string
  name: string
  status: SetupStatus
  inventoryActive: boolean
}

export type DishCoverage = 'controlled' | 'needs_counts' | 'variants_pending' | 'no_recipe'

export type TaskAction =
  | { type: 'count'; skuId: string; storageLocationId: string | null }
  | { type: 'receive'; skuId: string }
  | { type: 'recipe'; menuItemId: string; variantName: string | null }
  | { type: 'setup' }

export interface OverviewTask {
  id: string
  level: 'urgent' | 'important' | 'suggestion'
  title: string
  reason: string
  actionLabel: string
  action: TaskAction
}

export interface CoverageSummary {
  total: number
  withRecipe: number
  controlled: number
  needsCounts: number
  variantsPending: number
  noRecipe: number
}

export interface OverviewData {
  status: SetupStatus
  tasks: OverviewTask[]
  coverage: CoverageSummary
  dishesToSetup: Array<{
    menuItemId: string
    name: string
    categoryName: string
    soldLast30d: number
    coverage: DishCoverage
    pendingVariants: string[]
    missingCounts: Array<{ skuId: string; name: string }>
  }>
  today: { localHour: number; totals: { skus: number; neverCounted: number; stockValueCents?: number }; alerts: number } | null
  pendingSales: Array<{ menuItemId: string | null; name: string; variantName: string | null; reason: string | null; portions: number }>
  orphans: Orphan[]
}

export interface Orphan {
  recipeKey: string
  name: string
  menuItemId: string | null
  variantName: string | null
  reason: 'variant_missing' | 'dish_missing'
}

export interface RecipeItemView {
  skuId: string
  quantity: number
  unit: string
  skuName: string
}

export interface RecipeView {
  recipeId: string
  recipeKey: string
  variantName: string | null
  version: number
  usesBaseRecipe: boolean
  items: RecipeItemView[]
  costCents: number
  missingCost: number
  priceCents: number
  foodCostPct: number | null
}

export interface DishView {
  menuItemId: string
  name: string
  categoryName: string
  priceCents: number
  imageUrl?: string | null
  modifiers: string[]
  soldLast30d: number
  coverage: DishCoverage
  base: RecipeView | null
  variantStates: Array<{ name: string; priceCents: number; status: DishRecipeStatus; soldLast30d: number; recipe: RecipeView | null }>
  missingCounts: Array<{ skuId: string; name: string }>
}

export interface PreparationSummary {
  recipeId: string
  name: string
  outputSkuId: string
  outputQuantity: number | null
  version: number
  items: RecipeItemView[]
  costCents: number
  missingCost: number
}

export interface RecipesData {
  items: DishView[]
  coverage: CoverageSummary
  orphans: Orphan[]
  preparations: PreparationSummary[]
}

export interface SkuOption {
  _id: string
  name: string
  canonicalUnit: string
  category: string
  kind: string
  businessImpact: string
  lastUnitCostCents?: number
  parLevel: number | null
  supplierName: string | null
  lastPack?: { label: string; quantity: number; unit: string } | null
  isActive: boolean
}

export interface StorageOption {
  _id: string
  name: string
  locationId: string
  isDefaultConsumption: boolean
  isActive: boolean
}

export interface StockRow {
  skuId: string
  storageLocationId: string
  storageName: string
  locationId: string
  name: string
  category: string
  unit: string
  parLevel: number | null
  belief: { mu: number; sigma: number; anchored: boolean; dailyUsage: number; lastObservedAt: string | null; flags: string[] }
  confidence: string
  stockAlert: 'out' | 'low' | null
  coverageDays: number | null
  valueCents: number
}

export interface StockData {
  rows: StockRow[]
  untouched: Array<{ skuId: string; name: string; unit: string; category: string; kind: string }>
}

export interface ActivityLine {
  skuId: string
  skuName: string
  delta: number | null
  observed: number | null
  unit: string
}

export interface ActivityEntry {
  id: string
  kind: 'sale' | 'sale_reverted' | 'receipt' | 'count' | 'waste' | 'adjustment' | 'transfer_out' | 'transfer_in' | 'production'
  title: string
  detail: string | null
  occurredAt: string
  recordedAt: string
  actor: string
  source: string
  storageName: string | null
  lines: ActivityLine[]
  unitCostCents?: number | null
  warnings: string[]
}

export interface ActivityData {
  entries: ActivityEntry[]
  nextBefore: string | null
}

export interface HistoryEvent {
  id: string
  eventType: string
  occurredAt: string
  quantity: number | null
  observed: number | null
  detail: string | null
}

export interface DishSuggestion {
  key: string
  name: string
  category: string
  canonicalUnit: string
  businessImpact: string
  quantity: number
  unit: string
  existingSkuId: string | null
}
