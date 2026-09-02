import mongoose, { Schema, type Document } from "mongoose"

// ============================================================================
// InventoryLedgerModel — Event Ledger append-only e inmutable
// FASE04 §3.5 — Colección: inventory_ledger
// ⭐ CORAZÓN DEL SISTEMA — NUNCA update ni delete
// ============================================================================

// ── Document interface ───────────────────────────────────────────────────────

export interface IInventoryEventDocument extends Document {
  eventId: string
  tenantId: mongoose.Types.ObjectId
  skuId: mongoose.Types.ObjectId
  storageLocationId: mongoose.Types.ObjectId
  eventType:
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
  eventVersion: number
  occurredAt: Date
  recordedAt: Date
  actorId?: string
  source: "pos" | "manual" | "ocr" | "api" | "system"
  observationMethod?:
    | "connected_scale"
    | "manual_scale"
    | "visual_count"
    | "estimation"
  confidence: number
  correlationId?: string
  payload: Record<string, unknown>
  createdAt: Date
}

// ── Schema ───────────────────────────────────────────────────────────────────

const InventoryEventSchema = new Schema<IInventoryEventDocument>(
  {
    eventId: { type: String, required: true, unique: true },
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
    eventType: {
      type: String,
      enum: [
        "GoodsReceived",
        "SaleConsumed",
        "ProductionTransformed",
        "WasteRecorded",
        "PhysicalCountObserved",
        "AdjustmentApplied",
        "UnitEquivalenceLearned",
        "EvidenceRequested",
        "EvidenceIgnored",
        "ModelCalibrated",
      ],
      required: true,
    },
    eventVersion: { type: Number, default: 1 },
    occurredAt: { type: Date, required: true },
    recordedAt: { type: Date, required: true },
    actorId: { type: String, default: null },
    source: {
      type: String,
      enum: ["pos", "manual", "ocr", "api", "system"],
      required: true,
    },
    observationMethod: {
      type: String,
      enum: ["connected_scale", "manual_scale", "visual_count", "estimation"],
      default: null,
    },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    correlationId: { type: String, default: null },
    payload: { type: Schema.Types.Mixed, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    // Ledger es inmutable — no necesita updatedAt
  }
)

// ── Índices críticos ─────────────────────────────────────────────────────────

// Replay ordenado por aggregate (el más usado)
InventoryEventSchema.index(
  { tenantId: 1, skuId: 1, storageLocationId: 1, occurredAt: 1 },
  { name: "ledger_aggregate_replay" }
)

// Trazabilidad de solicitudes ignoradas
InventoryEventSchema.index(
  { eventType: 1, tenantId: 1, recordedAt: -1 },
  { name: "ledger_event_type_trace" }
)

// Sincronización offline
InventoryEventSchema.index(
  { tenantId: 1, recordedAt: 1, eventType: 1 },
  { name: "ledger_offline_sync" }
)

export const InventoryLedgerModel = mongoose.model<IInventoryEventDocument>(
  "InventoryLedger",
  InventoryEventSchema,
  "inventory_ledger"
)
