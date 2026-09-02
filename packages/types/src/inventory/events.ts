// ============================================================================
// INVENTORY EVENTS — Tipos del Event Ledger
// FASE04 §3.5
// ============================================================================

import type { CanonicalUnit } from "./catalog"

// ── Tipos de evento (siempre en tiempo pasado) ───────────────────────────────
export type InventoryEventType =
  | "GoodsReceived"
  | "SaleConsumed"
  | "ProductionTransformed"
  | "WasteRecorded"
  | "PhysicalCountObserved"
  | "AdjustmentApplied"
  | "UnitEquivalenceLearned"
  | "EvidenceRequested"
  | "EvidenceIgnored"
  | "ModelCalibrated"

// ── Fuente del dato ──────────────────────────────────────────────────────────
export type EventSource = "pos" | "manual" | "ocr" | "api" | "system"

// ── Método de observación (solo evidencia física) ────────────────────────────
export type ObservationMethod =
  | "connected_scale"
  | "manual_scale"
  | "visual_count"
  | "estimation"

// ── Razón de merma ───────────────────────────────────────────────────────────
export type WasteReason =
  | "expiration"
  | "damage"
  | "preparation"
  | "contamination"
  | "other"

// ── Payloads por tipo de evento ──────────────────────────────────────────────
export interface GoodsReceivedPayload {
  quantity: number
  unit: CanonicalUnit
  /** @storedAs cents */
  unitCostCents: number
  supplierId?: string
  invoiceRef?: string
  notes?: string
}

export interface SaleConsumedPayload {
  quantityConsumed: number
  unit: CanonicalUnit
  recipeId?: string
  saleId: string
  isTheoretical: boolean
}

export interface ProductionTransformedPayload {
  recipeId: string
  inputQuantity: number
  outputQuantity: number
  yieldObserved: number
  batchId?: string
  notes?: string
}

export interface WasteRecordedPayload {
  quantity: number
  unit: CanonicalUnit
  reason: WasteReason
  notes?: string
}

export interface PhysicalCountObservedPayload {
  observedQuantity: number
  unit: CanonicalUnit
  previousEstimateMu: number
  previousEstimateSigma: number
  difference: number
}

export interface AdjustmentAppliedPayload {
  delta: number
  unit: CanonicalUnit
  reason: string
  previousEstimateMu: number
  hypothesisTree: string[]
}

export interface UnitEquivalenceLearnedPayload {
  fromUnit: string
  toUnit: CanonicalUnit
  factor: number
  source: "declared" | "observed" | "system_inferred"
}

export interface EvidenceRequestedPayload {
  eerScore: number
  reason: "high_uncertainty" | "contradiction" | "long_gap" | "economic_risk"
  priority: "critical" | "high" | "medium"
  validUntil: Date
}

export interface EvidenceIgnoredPayload {
  requestEventId: string
  daysIgnored: number
  degradationStep: 1 | 2 | 3
}

export interface ModelCalibratedPayload {
  parameter: string
  oldValue: number
  newValue: number
  calibrationSource: "physical_count" | "recipe_analysis" | "yield_drift"
}

// ── Unión discriminada de payloads ───────────────────────────────────────────
export type InventoryEventPayload =
  | GoodsReceivedPayload
  | SaleConsumedPayload
  | ProductionTransformedPayload
  | WasteRecordedPayload
  | PhysicalCountObservedPayload
  | AdjustmentAppliedPayload
  | UnitEquivalenceLearnedPayload
  | EvidenceRequestedPayload
  | EvidenceIgnoredPayload
  | ModelCalibratedPayload

// ── Evento completo del ledger ───────────────────────────────────────────────
export interface InventoryEvent {
  id: string
  eventId: string
  tenantId: string
  skuId: string
  storageLocationId: string
  eventType: InventoryEventType
  eventVersion: number
  occurredAt: Date
  recordedAt: Date
  actorId?: string
  source: EventSource
  observationMethod?: ObservationMethod
  confidence: number
  correlationId?: string
  payload: InventoryEventPayload
}
