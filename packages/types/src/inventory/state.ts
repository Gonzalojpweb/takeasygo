// ============================================================================
// INVENTORY STATE — Tipos del estado proyectado
// FASE04 §3.6–3.7
// ============================================================================

import type { ObservationMethod } from "./events"

// ── Flags de hipótesis ───────────────────────────────────────────────────────
export type HypothesisFlag =
  | "possible_under_portioning"
  | "possible_unrecorded_waste"
  | "possible_recipe_drift"
  | "possible_reception_error"
  | "possible_measurement_error"
  | "stock_negative_contradiction"
  | "yield_drift_detected"

// ── Nivel de confianza derivado ──────────────────────────────────────────────
export type ConfidenceLevel = "high" | "medium" | "low" | "critical"

// ── Estado proyectado (1 doc por SKU × ubicación) ───────────────────────────
export interface InventoryState {
  id: string
  tenantId: string
  skuId: string
  storageLocationId: string

  // Estado estimado
  estimateMu: number
  estimateSigma: number
  confidenceLevel: ConfidenceLevel

  // Última evidencia física
  lastPhysicalObservationAt?: Date
  lastPhysicalObservationMethod?: ObservationMethod
  daysSinceObservation: number

  // Solicitudes de evidencia abiertas
  openEvidenceRequest: boolean
  openEvidenceRequestId?: string
  evidenceDegradationStep: 0 | 1 | 2 | 3

  // Árbol de hipótesis activo
  hypothesisFlags: HypothesisFlag[]

  // Velocidad de consumo (rolling 7 días)
  consumptionVelocity7d: number

  // Referencia al ledger
  lastEventId: string
  lastEventSequence: number

  updatedAt: Date
}

// ── Snapshot histórico ───────────────────────────────────────────────────────
export interface InventoryStateSnapshot {
  id: string
  tenantId: string
  skuId: string
  storageLocationId: string
  snapshotAt: Date
  state: Omit<InventoryState, "id" | "tenantId" | "updatedAt">
  lastEventId: string
  lastEventSequence: number
  createdAt: Date
}

// ── Prioridad EER (calculada al vuelo, NO persistida) ────────────────────────
export interface InventoryPriority {
  skuId: string
  storageLocationId: string
  skuName: string
  category: string
  eerScore: number
  estimateMu: number
  estimateSigma: number
  confidenceLevel: ConfidenceLevel
  daysSinceObservation: number
  consumptionVelocity7d: number
  hypothesisFlags: HypothesisFlag[]
}
