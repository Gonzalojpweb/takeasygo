// ============================================================================
// INVENTORY EVENTS v2 — Catálogo del Event Ledger
// Fuente normativa: INVENTARIO/DECISIONES_VIGENTES.md (D-03 … D-10)
// ============================================================================
// Dos familias de eventos conviven en `inventory_ledger`:
//
//  · Eventos de INSUMO (aggregate = insumo × depósito): recepción, merma,
//    conteo, ajuste, transferencia, producción. Llevan skuId + storageLocationId.
//
//  · Eventos de VENTA (D-04): UN evento por línea vendida (plato), no uno por
//    insumo. Lleva el consumo calculado con la versión de receta vigente en
//    `consumption[]`. Las correcciones (cantidad cambiada, línea quitada,
//    pedido cancelado) son eventos nuevos con porciones negativas: el pasado
//    nunca se edita.
//
// Cantidades: siempre en la unidad canónica del insumo (D-07).
// Dinero: siempre centavos enteros.
// `source` y `actorId` los define el SERVIDOR, nunca el cliente (D-09).
// ============================================================================

import type { CanonicalUnit } from "./catalog"

export type InventoryEventType =
  // ── Eventos de insumo ──
  | "GoodsReceived"
  | "WasteRecorded"
  | "PhysicalCountObserved"
  | "AdjustmentApplied"
  | "TransferOut"
  | "TransferIn"
  | "ProductionTransformed"
  | "EvidenceRequested"
  | "EvidenceIgnored"
  // ── Evento de venta (multi-insumo) ──
  | "SaleRecorded"
  // ── Legado v1 (solo lectura: el proyector los entiende, nadie los emite) ──
  | "SaleConsumed"

export const SKU_EVENT_TYPES = [
  "GoodsReceived",
  "WasteRecorded",
  "PhysicalCountObserved",
  "AdjustmentApplied",
  "TransferOut",
  "TransferIn",
  "ProductionTransformed",
  "EvidenceRequested",
  "EvidenceIgnored",
  "SaleConsumed",
] as const satisfies readonly InventoryEventType[]

/** Quién/qué originó el evento. Lo asigna el servidor según el canal. */
export type EventSource = "pos" | "online" | "manual" | "ocr" | "scale" | "system"

/** Cómo se midió (solo evidencia física). Lo declara quien observa. */
export type ObservationMethod = "connected_scale" | "manual_scale" | "visual_count" | "estimation"

export type WasteReason = "expiration" | "damage" | "preparation" | "contamination" | "staff_meal" | "other"

// ── Payloads de insumo ────────────────────────────────────────────────────────

export interface GoodsReceivedPayload {
  quantity: number
  unit: CanonicalUnit
  /** Costo por unidad canónica. @storedAs cents */
  unitCostCents: number
  supplierName?: string | null
  invoiceRef?: string | null
  /** Cantidad y unidad tal como vinieron en el remito, para auditoría. */
  declared?: { quantity: number; unit: string } | null
}

export interface WasteRecordedPayload {
  quantity: number
  unit: CanonicalUnit
  reason: WasteReason
  notes?: string | null
}

export interface PhysicalCountObservedPayload {
  observedQuantity: number
  unit: CanonicalUnit
  /** Lo que el sistema estimaba al registrar (informativo; la discrepancia
   *  oficial la recalcula el proyector en orden de ocurrencia). */
  expectedAtRecord?: { mu: number; sigma: number } | null
  /** Si responde a una solicitud de verificación. */
  requestEventId?: string | null
}

export interface AdjustmentAppliedPayload {
  delta: number
  unit: CanonicalUnit
  /** Motivo descriptivo obligatorio (≥ 10 caracteres). */
  reason: string
}

export interface TransferPayload {
  quantity: number
  unit: CanonicalUnit
  transferId: string
  fromStorageLocationId: string
  toStorageLocationId: string
  fromLocationId: string
  toLocationId: string
  /** Costo promedio que viaja con la mercadería. @storedAs cents */
  unitCostCents?: number | null
  reason?: string | null
}

export interface ProductionTransformedPayload {
  direction: "input" | "output"
  quantity: number
  unit: CanonicalUnit
  batchId: string
  recipeId?: string | null
  /** Solo en output: costo asignado por unidad. @storedAs cents */
  unitCostCents?: number | null
}

export interface EvidenceRequestedPayload {
  reason: "never_observed" | "high_uncertainty" | "stockout_risk" | "discrepancy" | "negative_estimate"
  valueAtRiskCents: number
  validUntil: string
}

export interface EvidenceIgnoredPayload {
  requestEventId: string
  timesIgnored: number
}

// ── Payload de venta (D-04) ───────────────────────────────────────────────────

export interface SaleConsumptionLine {
  skuId: string
  storageLocationId: string
  /** Cantidad consumida en unidad canónica; negativa en reversiones. */
  quantity: number
  unit: CanonicalUnit
}

export interface SaleRecordedPayload {
  orderId: string
  orderNumber?: string | null
  lineId: string
  menuItemId: string | null
  name: string
  variantName?: string | null
  modifiers: string[]
  /** Porciones de este evento: positivas al vender, negativas al revertir. */
  portions: number
  reason: "sold" | "quantity_changed" | "removed" | "cancelled"
  locationId: string
  recipeId: string | null
  recipeVersion: number | null
  /** Consumo calculado con la receta vigente al momento del evento. */
  consumption: SaleConsumptionLine[]
  /** true si el plato no tiene receta: venta registrada, consumo desconocido. */
  unmapped: boolean
  /**
   * true si se vendió una variante ("Triple") SIN receta propia y se descontó
   * la receta base del plato. El consumo probablemente está subestimado: la UI
   * lo muestra como pendiente de configurar (antes pasaba en silencio).
   */
  baseRecipeFallback?: boolean
  warnings: string[]
}

export type InventoryEventPayload =
  | GoodsReceivedPayload
  | WasteRecordedPayload
  | PhysicalCountObservedPayload
  | AdjustmentAppliedPayload
  | TransferPayload
  | ProductionTransformedPayload
  | EvidenceRequestedPayload
  | EvidenceIgnoredPayload
  | SaleRecordedPayload

export interface InventoryEvent {
  eventId: string
  tenantId: string
  /** Solo eventos de insumo. */
  skuId?: string | null
  storageLocationId?: string | null
  eventType: InventoryEventType
  eventVersion: number
  occurredAt: Date
  recordedAt: Date
  actorId?: string | null
  source: EventSource
  observationMethod?: ObservationMethod | null
  correlationId?: string | null
  payload: InventoryEventPayload
}
