import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// InventoryLedger — Event Ledger append-only e inmutable
// FASE04 §3.5 — Colección: inventory_ledger
// ⭐ CORAZÓN DEL SISTEMA — NUNCA update ni delete
// ============================================================================

export interface IInventoryEvent extends Document {
  eventId: string
  tenantId: mongoose.Types.ObjectId
  skuId: mongoose.Types.ObjectId
  storageLocationId: mongoose.Types.ObjectId
  eventType: 'GoodsReceived' | 'SaleConsumed' | 'ProductionTransformed' | 'WasteRecorded' | 'PhysicalCountObserved' | 'AdjustmentApplied' | 'UnitEquivalenceLearned' | 'EvidenceRequested' | 'EvidenceIgnored' | 'ModelCalibrated'
  eventVersion: number
  occurredAt: Date
  recordedAt: Date
  actorId?: string
  source: 'pos' | 'manual' | 'ocr' | 'api' | 'system'
  observationMethod?: 'connected_scale' | 'manual_scale' | 'visual_count' | 'estimation'
  confidence: number
  correlationId?: string
  payload: Record<string, unknown>
  createdAt: Date
}

const InventoryEventSchema = new Schema<IInventoryEvent>({
  eventId: { type: String, required: true, unique: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  skuId: { type: Schema.Types.ObjectId, ref: 'InventorySKU', required: true },
  storageLocationId: { type: Schema.Types.ObjectId, ref: 'InventoryStorageLocation', required: true },
  eventType: {
    type: String,
    enum: ['GoodsReceived', 'SaleConsumed', 'ProductionTransformed', 'WasteRecorded', 'PhysicalCountObserved', 'AdjustmentApplied', 'UnitEquivalenceLearned', 'EvidenceRequested', 'EvidenceIgnored', 'ModelCalibrated'],
    required: true,
  },
  eventVersion: { type: Number, default: 1 },
  occurredAt: { type: Date, required: true },
  recordedAt: { type: Date, required: true },
  actorId: { type: String, default: null },
  source: { type: String, enum: ['pos', 'manual', 'ocr', 'api', 'system'], required: true },
  observationMethod: { type: String, enum: ['connected_scale', 'manual_scale', 'visual_count', 'estimation'], default: null },
  confidence: { type: Number, required: true, min: 0, max: 1 },
  correlationId: { type: String, default: null },
  payload: { type: Schema.Types.Mixed, required: true },
}, {
  timestamps: { createdAt: true, updatedAt: false },
})

// Índices críticos
InventoryEventSchema.index({ tenantId: 1, skuId: 1, storageLocationId: 1, occurredAt: 1 }, { name: 'ledger_aggregate_replay' })
InventoryEventSchema.index({ eventType: 1, tenantId: 1, recordedAt: -1 }, { name: 'ledger_event_type_trace' })
InventoryEventSchema.index({ tenantId: 1, recordedAt: 1, eventType: 1 }, { name: 'ledger_offline_sync' })

const InventoryLedger = mongoose.models.InventoryLedger || mongoose.model<IInventoryEvent>('InventoryLedger', InventoryEventSchema, 'inventory_ledger')
export default InventoryLedger
