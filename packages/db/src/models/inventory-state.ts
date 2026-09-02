import mongoose, { Schema, type Document } from "mongoose"

// ============================================================================
// InventoryStateModel — Estado proyectado (caché operacional)
// FASE04 §3.6 — Colección: inventory_state
// 1 doc por SKU × ubicación — actualizado en la misma transacción del ledger
// ============================================================================

export interface IInventoryStateDocument extends Document {
  tenantId: mongoose.Types.ObjectId
  skuId: mongoose.Types.ObjectId
  storageLocationId: mongoose.Types.ObjectId

  // Estado estimado
  estimateMu: number
  estimateSigma: number
  confidenceLevel: "high" | "medium" | "low" | "critical"

  // Última evidencia física
  lastPhysicalObservationAt?: Date
  lastPhysicalObservationMethod?:
    | "connected_scale"
    | "manual_scale"
    | "visual_count"
    | "estimation"
  daysSinceObservation: number

  // Solicitudes de evidencia abiertas
  openEvidenceRequest: boolean
  openEvidenceRequestId?: string
  evidenceDegradationStep: 0 | 1 | 2 | 3

  // Árbol de hipótesis activo
  hypothesisFlags: string[]

  // Velocidad de consumo (rolling 7 días)
  consumptionVelocity7d: number

  // Referencia al ledger
  lastEventId: string
  lastEventSequence: number

  updatedAt: Date
}

const InventoryStateSchema = new Schema<IInventoryStateDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    skuId: {
      type: Schema.Types.ObjectId,
      ref: "InventorySKU",
      required: true,
    },
    storageLocationId: {
      type: Schema.Types.ObjectId,
      ref: "InventoryStorageLocation",
      required: true,
    },

    estimateMu: { type: Number, required: true, default: 0 },
    estimateSigma: { type: Number, required: true, default: 0 },
    confidenceLevel: {
      type: String,
      enum: ["high", "medium", "low", "critical"],
      default: "low",
    },

    lastPhysicalObservationAt: { type: Date, default: null },
    lastPhysicalObservationMethod: {
      type: String,
      enum: ["connected_scale", "manual_scale", "visual_count", "estimation"],
      default: null,
    },
    daysSinceObservation: { type: Number, default: 0 },

    openEvidenceRequest: { type: Boolean, default: false },
    openEvidenceRequestId: { type: String, default: null },
    evidenceDegradationStep: {
      type: Number,
      enum: [0, 1, 2, 3],
      default: 0,
    },

    hypothesisFlags: { type: [String], default: [] },

    consumptionVelocity7d: { type: Number, default: 0 },

    lastEventId: { type: String, required: true },
    lastEventSequence: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
)

// ── Índices ──────────────────────────────────────────────────────────────────

// Lookup principal — 1 doc por SKU×ubicación (unique)
InventoryStateSchema.index(
  { tenantId: 1, skuId: 1, storageLocationId: 1 },
  { unique: true }
)

// Lista de prioridades diaria (para EER)
InventoryStateSchema.index(
  { tenantId: 1, estimateSigma: -1 },
  { name: "state_sigma_rank" }
)

// Solicitudes abiertas
InventoryStateSchema.index(
  { tenantId: 1, openEvidenceRequest: 1 },
  { name: "state_open_requests" }
)

export const InventoryStateModel = mongoose.model<IInventoryStateDocument>(
  "InventoryState",
  InventoryStateSchema,
  "inventory_state"
)
