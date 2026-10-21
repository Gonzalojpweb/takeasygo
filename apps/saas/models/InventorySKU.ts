import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// InventorySKU v2 — Insumo (catálogo del tenant)
// Colección: inventory_skus
// ============================================================================
// · `canonicalUnit` es fija: el ledger guarda todas las cantidades del insumo
//   en esa unidad (D-07). No se edita una vez que hay eventos.
// · `lastUnitCostCents` = último precio de compra (referencia, lo actualiza
//   cada recepción). El costo de mercadería usa el costo PROMEDIO ponderado
//   que lleva el estado por depósito.
// · `kind: 'prepared'` = se produce en el local (salsa, masa): su stock entra
//   por producción, no por compra.
// ============================================================================

export const SKU_CATEGORIES = ['meat_poultry', 'fish_seafood', 'vegetables', 'fruits', 'dairy', 'dry_goods', 'beverages', 'packaging', 'other'] as const
export const SKU_UNITS = ['kg', 'g', 'l', 'ml', 'unit'] as const
export const SKU_IMPACTS = ['critical', 'high', 'medium', 'low'] as const

export interface IInventorySKU extends Document {
  tenantId: mongoose.Types.ObjectId
  name: string
  nameKey: string
  skuCode: string | null
  category: (typeof SKU_CATEGORIES)[number]
  kind: 'raw' | 'prepared'
  canonicalUnit: (typeof SKU_UNITS)[number]
  businessImpact: (typeof SKU_IMPACTS)[number]
  /** @storedAs cents */
  lastUnitCostCents: number
  parLevel: number | null
  supplierName: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const InventorySKUSchema = new Schema<IInventorySKU>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  /** Nombre normalizado (sin acentos/mayúsculas) para evitar duplicados. */
  nameKey: { type: String, required: true },
  skuCode: { type: String, default: null },
  category: { type: String, enum: SKU_CATEGORIES, required: true },
  kind: { type: String, enum: ['raw', 'prepared'], default: 'raw' },
  canonicalUnit: { type: String, enum: SKU_UNITS, required: true },
  businessImpact: { type: String, enum: SKU_IMPACTS, default: 'medium' },
  lastUnitCostCents: { type: Number, default: 0, min: 0 },
  parLevel: { type: Number, default: null, min: 0 },
  supplierName: { type: String, default: null, maxlength: 120 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true })

InventorySKUSchema.index({ tenantId: 1, nameKey: 1 }, { unique: true, name: 'sku_name' })
InventorySKUSchema.index({ tenantId: 1, isActive: 1 })
InventorySKUSchema.index(
  { tenantId: 1, skuCode: 1 },
  { unique: true, partialFilterExpression: { skuCode: { $type: 'string' } }, name: 'sku_code' },
)

const InventorySKU =
  (mongoose.models.InventorySKU as mongoose.Model<IInventorySKU>) ||
  mongoose.model<IInventorySKU>('InventorySKU', InventorySKUSchema, 'inventory_skus')
export default InventorySKU
