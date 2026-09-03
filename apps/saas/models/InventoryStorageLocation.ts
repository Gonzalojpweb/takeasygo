import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// InventoryStorageLocation — Almacenes/ubicaciones de stock
// FASE04 §3.2 — Colección: inventory_storage_locations
// ============================================================================

export interface IInventoryStorageLocation extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  name: string
  type: 'cold_storage' | 'dry_storage' | 'bar' | 'kitchen' | 'other'
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const InventoryStorageLocationSchema = new Schema<IInventoryStorageLocation>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['cold_storage', 'dry_storage', 'bar', 'kitchen', 'other'], required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true })

InventoryStorageLocationSchema.index({ tenantId: 1, isActive: 1 })

const InventoryStorageLocation = mongoose.models.InventoryStorageLocation || mongoose.model<IInventoryStorageLocation>('InventoryStorageLocation', InventoryStorageLocationSchema, 'inventory_storage_locations')
export default InventoryStorageLocation
