// ============================================================================
// INVENTORY STATE v2 — Creencia del sistema sobre un insumo × depósito
// ============================================================================
// El estado NO es "el stock": es la mejor estimación (μ) con su incertidumbre
// (σ) y la evidencia que la sostiene. Es una proyección descartable del
// ledger: si hay conflicto, gana el ledger (D-05).
// ============================================================================

import type { ObservationMethod } from "./events"

export type InventoryFlag =
  /** Nunca se contó: μ parte de cero y no representa el stock real (D-11). */
  | "never_observed"
  /** μ < 0: se consumió más de lo que el sistema sabía que había (D-06). */
  | "negative_estimate"
  /** El último conteo difiere del estimado más de lo que explica la incertidumbre. */
  | "discrepancy"
  /** Hay ventas de platos sin receta en el período (consumo desconocido). */
  | "unmapped_sales"

/** Nivel operacional para la UI. "unknown" = sin conteo inicial. */
export type ConfidenceLevel = "high" | "medium" | "low" | "critical" | "unknown"

export interface DiscrepancyRecord {
  at: string
  expected: number
  observed: number
  difference: number
  /** Diferencia en desvíos estándar de la predicción. */
  zScore: number
  /** Valor económico de la diferencia. @storedAs cents */
  valueCents: number
}

export interface InventoryBelief {
  mu: number
  sigma: number
  /** Fecha (de ocurrencia) hasta la que está proyectado el estado. */
  asOf: string | null
  anchored: boolean
  lastObservedAt: string | null
  lastObservationMethod: ObservationMethod | null
  /** Consumo diario suavizado (EWMA) en unidad canónica. */
  dailyUsage: number
  /** Costo promedio ponderado por unidad canónica. @storedAs cents */
  avgUnitCostCents: number
  flags: InventoryFlag[]
  lastDiscrepancy: DiscrepancyRecord | null
  eventsApplied: number
}
