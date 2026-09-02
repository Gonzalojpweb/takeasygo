import mongoose, { Schema, type Document } from "mongoose"

// ============================================================================
// InventoryStateSnapshotModel — Snapshots para reconstrucción histórica
// FASE04 §3.7 — Colección: inventory_state_snapshots
// Solo para SKUs con actividad en el período (§8.4)
// ============================================================================

export interface IInventoryStateSnapshotDocument extends Document {
  tenantId: mongoose.Types.ObjectId
  skuId: mongoose.Types.ObjectId
  storageLocationId: mongoose.Types.ObjectId
  snapshotAt: Date
  state: {
    estimateMu: number
    estimateSigma: number
    confidenceLevel: string
    lastPhysicalObservationAt?: Date
    lastPhysicalObservationMethod?: string
    daysSinceObservation: number
    openEvidenceRequest: boolean
    openEvidenceRequestId?: string
    evidenceDegradationStep: number
    hypothesisFlags: string[]
    consumptionVelocity7d: number
  }
  lastEventId: string
  lastEventSequence: number
  createdAt: Date
}

const StateSnapshotDataSchema = new Schema(
  {
    estimateMu: { type: Number, required: true },
    estimateSigma: { type: Number, required: true },
    confidenceLevel: { type: String, required: true },
    lastPhysicalObservationAt: { type: Date, default: null },
    lastPhysicalObservationMethod: { type: String, default: null },
    daysSinceObservation: { type: Number, required: true },
    openEvidenceRequest: { type: Boolean, required: true },
    openEvidenceRequestId: { type: String, default: null },
    evidenceDegradationStep: { type: Number, required: true },
    hypothesisFlags: { type: [String], default: [] },
    consumptionVelocity7d: { type: Number, required: true },
  },
  { _id: false }
)

const InventoryStateSnapshotSchema =
  new Schema<IInventoryStateSnapshotDocument>(
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
      snapshotAt: { type: Date, required: true },
      state: { type: StateSnapshotDataSchema, required: true },
      lastEventId: { type: String, required: true },
      lastEventSequence: { type: Number, required: true },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
  )

// ── Índices ──────────────────────────────────────────────────────────────────

// Lookup para reconstrucción: encontrar snapshot anterior a una fecha
InventoryStateSnapshotSchema.index(
  { tenantId: 1, skuId: 1, storageLocationId: 1, snapshotAt: -1 },
  { name: "snapshot_reconstruct" }
)

export const InventoryStateSnapshotModel =
  mongoose.model<IInventoryStateSnapshotDocument>(
    "InventoryStateSnapshot",
    InventoryStateSnapshotSchema,
    "inventory_state_snapshots"
  )
