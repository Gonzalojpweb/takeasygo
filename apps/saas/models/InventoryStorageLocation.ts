import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// InventoryStorageLocation — Depósitos de stock de una sede
// Colección: inventory_storage_locations · DECISIONES_VIGENTES D-12
// ============================================================================
// `locationId` (sede) es siempre obligatorio. Cada sede tiene UN depósito de
// consumo (`isDefaultConsumption`) del que se descuentan sus ventas; se crea
// automáticamente al activar inventario en la sede.
// ============================================================================

export interface IInventoryStorageLocation extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  name: string
  type: 'cold_storage' | 'dry_storage' | 'bar' | 'kitchen' | 'other'
  isDefaultConsumption: boolean
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const InventoryStorageLocationSchema = new Schema<IInventoryStorageLocation>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  type: { type: String, enum: ['cold_storage', 'dry_storage', 'bar', 'kitchen', 'other'], required: true },
  isDefaultConsumption: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
}, { timestamps: true })

InventoryStorageLocationSchema.index({ tenantId: 1, locationId: 1, isActive: 1 })
// A lo sumo un depósito de consumo por sede.
InventoryStorageLocationSchema.index(
  { tenantId: 1, locationId: 1 },
  { unique: true, partialFilterExpression: { isDefaultConsumption: true }, name: 'storage_default_consumption' },
)

const InventoryStorageLocation =
  (mongoose.models.InventoryStorageLocation as mongoose.Model<IInventoryStorageLocation>) ||
  mongoose.model<IInventoryStorageLocation>('InventoryStorageLocation', InventoryStorageLocationSchema, 'inventory_storage_locations')
export default InventoryStorageLocation
