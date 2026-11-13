import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// Supplier — Proveedores del comercio (F2, 13/11/2026)
// Colección: inventory_suppliers
// ============================================================================
// Por comercio (tenant), igual que los insumos. `products` es lo que el
// proveedor nos vende con el último precio pagado (centavos por unidad base
// del insumo); se actualiza solo al recibir una orden de compra.
// InventorySKU.supplierName sigue existiendo (texto libre de la recepción
// manual); al recibir una orden se completa con el nombre del proveedor.
// ============================================================================

export interface ISupplierProduct {
  skuId: mongoose.Types.ObjectId
  /** Código del producto en el proveedor (opcional). */
  code: string | null
  lastUnitCostCents: number | null
  lastPurchasedAt: Date | null
}

export interface ISupplier extends Document {
  tenantId: mongoose.Types.ObjectId
  name: string
  /** Nombre normalizado (minúsculas, sin acentos ni espacios dobles): único por comercio. */
  nameKey: string
  taxId: string | null
  contactName: string | null
  phone: string | null
  email: string | null
  paymentTerms: string | null
  leadTimeDays: number | null
  notes: string | null
  products: ISupplierProduct[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const ProductSchema = new Schema<ISupplierProduct>({
  skuId: { type: Schema.Types.ObjectId, ref: 'InventorySKU', required: true },
  code: { type: String, default: null, maxlength: 60 },
  lastUnitCostCents: { type: Number, default: null },
  lastPurchasedAt: { type: Date, default: null },
}, { _id: false })

const SupplierSchema = new Schema<ISupplier>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  nameKey: { type: String, required: true },
  taxId: { type: String, default: null, maxlength: 20 },
  contactName: { type: String, default: null, maxlength: 120 },
  phone: { type: String, default: null, maxlength: 40 },
  email: { type: String, default: null, maxlength: 160 },
  paymentTerms: { type: String, default: null, maxlength: 200 },
  leadTimeDays: { type: Number, default: null, min: 0, max: 365 },
  notes: { type: String, default: null, maxlength: 500 },
  products: { type: [ProductSchema], default: [] },
  isActive: { type: Boolean, default: true },
}, { timestamps: true, collection: 'inventory_suppliers' })

SupplierSchema.index({ tenantId: 1, nameKey: 1 }, { unique: true })
SupplierSchema.index({ tenantId: 1, isActive: 1, name: 1 })

export default (mongoose.models.Supplier as mongoose.Model<ISupplier>) ||
  mongoose.model<ISupplier>('Supplier', SupplierSchema)
