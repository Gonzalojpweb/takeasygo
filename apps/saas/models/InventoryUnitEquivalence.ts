import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// InventoryUnitEquivalence — Tabla de conversiones aprendidas
// FASE04 §3.3 — Colección: inventory_unit_equivalences
// ============================================================================

export interface IInventoryUnitEquivalence extends Document {
  tenantId: mongoose.Types.ObjectId
  skuId: mongoose.Types.ObjectId
  fromUnit: string
  toUnit: 'kg' | 'g' | 'l' | 'ml' | 'unit'
  declaredFactor: number
  observedFactor?: number
  observedConfidence: number
  observationsCount: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const InventoryUnitEquivalenceSchema = new Schema<IInventoryUnitEquivalence>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  skuId: { type: Schema.Types.ObjectId, ref: 'InventorySKU', required: true },
  fromUnit: { type: String, required: true },
  toUnit: { type: String, enum: ['kg', 'g', 'l', 'ml', 'unit'], required: true },
  declaredFactor: { type: Number, required: true },
  observedFactor: { type: Number, default: null },
  observedConfidence: { type: Number, default: 0, min: 0, max: 1 },
  observationsCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true })

InventoryUnitEquivalenceSchema.index({ tenantId: 1, isActive: 1 })
InventoryUnitEquivalenceSchema.index({ tenantId: 1, skuId: 1, fromUnit: 1 }, { unique: true })

const InventoryUnitEquivalence = mongoose.models.InventoryUnitEquivalence || mongoose.model<IInventoryUnitEquivalence>('InventoryUnitEquivalence', InventoryUnitEquivalenceSchema, 'inventory_unit_equivalences')
export default InventoryUnitEquivalence
