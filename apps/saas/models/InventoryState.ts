import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// InventoryState — Estado proyectado (caché operacional)
// FASE04 §3.6 — Colección: inventory_state
// 1 doc por SKU × ubicación — actualizado en la misma transacción del ledger
// ============================================================================

export interface IInventoryState extends Document {
  tenantId: mongoose.Types.ObjectId
  skuId: mongoose.Types.ObjectId
  storageLocationId: mongoose.Types.ObjectId
  estimateMu: number
  estimateSigma: number
  confidenceLevel: 'high' | 'medium' | 'low' | 'critical'
  lastPhysicalObservationAt?: Date
  lastPhysicalObservationMethod?: 'connected_scale' | 'manual_scale' | 'visual_count' | 'estimation'
  daysSinceObservation: number
  openEvidenceRequest: boolean
  openEvidenceRequestId?: string
  evidenceDegradationStep: 0 | 1 | 2 | 3
  hypothesisFlags: string[]
  consumptionVelocity7d: number
  lastEventId: string
  lastEventSequence: number
  updatedAt: Date
}

const InventoryStateSchema = new Schema<IInventoryState>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  skuId: { type: Schema.Types.ObjectId, ref: 'InventorySKU', required: true },
  storageLocationId: { type: Schema.Types.ObjectId, ref: 'InventoryStorageLocation', required: true },
  estimateMu: { type: Number, required: true, default: 0 },
  estimateSigma: { type: Number, required: true, default: 0 },
  confidenceLevel: { type: String, enum: ['high', 'medium', 'low', 'critical'], default: 'low' },
  lastPhysicalObservationAt: { type: Date, default: null },
  lastPhysicalObservationMethod: { type: String, enum: ['connected_scale', 'manual_scale', 'visual_count', 'estimation'], default: null },
  daysSinceObservation: { type: Number, default: 0 },
  openEvidenceRequest: { type: Boolean, default: false },
  openEvidenceRequestId: { type: String, default: null },
  evidenceDegradationStep: { type: Number, enum: [0, 1, 2, 3], default: 0 },
  hypothesisFlags: { type: [String], default: [] },
  consumptionVelocity7d: { type: Number, default: 0 },
  lastEventId: { type: String, required: true },
  lastEventSequence: { type: Number, required: true, default: 0 },
}, { timestamps: true })

InventoryStateSchema.index({ tenantId: 1, skuId: 1, storageLocationId: 1 }, { unique: true })
InventoryStateSchema.index({ tenantId: 1, estimateSigma: -1 }, { name: 'state_sigma_rank' })
InventoryStateSchema.index({ tenantId: 1, openEvidenceRequest: 1 }, { name: 'state_open_requests' })

const InventoryState = mongoose.models.InventoryState || mongoose.model<IInventoryState>('InventoryState', InventoryStateSchema, 'inventory_state')
export default InventoryState
