// ============================================================================
// Contrato de escenario (V-A §34): salida del Synthetic Restaurant Generator
// ============================================================================

import type { BusinessImpact, CanonicalUnit, SKUCategory } from '@takeasygo/types'

export type HumanProfile = 'disciplinado' | 'normal' | 'sobrecargado' | 'experto' | 'resistente'
export type SkuClass = 'A' | 'B' | 'C' | 'D' | 'E'

export type StressType =
  | 'omissions'
  | 'bad_receiving'
  | 'volatile_yield'
  | 'demand_shock'
  | 'rush_hours'
  | 'unobserved_waste'
  | 'late_events'
  | 'new_product'
  | 'perishables'
  | 'ignored_observations'

export interface ScenarioPackage {
  metadata: {
    scenarioId: string
    seed: number
    horizonDays: 30 | 90 | 180
    scenarioClass: 'normal' | 'stress'
    stressType?: StressType
    generatorVersion: string
  }
  catalog: {
    skus: Array<{
      id: string
      name: string
      category: SKUCategory
      unit: CanonicalUnit
      class: SkuClass
      unitCostCents: number
      perishabilityDays: number | null
      impact: BusinessImpact
    }>
    products: Array<{ id: string; name: string; priceCents: number; recipe: Array<{ skuId: string; quantity: number }> }>
  }
  humanProfile: {
    name: HumanProfile
    dailyAttentionMinutes: number
    omissionBaseRate: number
    omissionPressureSensitivity: number
  }
}
