import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// PurchaseOrder — Órdenes de compra a proveedores (F2, 13/11/2026)
// Colección: inventory_purchase_orders
// ============================================================================
// borrador → enviada → parcial → recibida (o cancelada). Por comercio; cada
// línea reparte la cantidad entre sedes y depósitos (`allocations`).
//
// El stock lo mueve el ledger: cada recepción escribe un GoodsReceived por
// insumo y depósito con eventId determinístico
// (`po:{_id}:{receiptId}:{skuId}:{storageId}`), así que reintentar la misma
// recepción no duplica. `receipts` guarda cada entrega (con factura/remito).
// Cantidades en la unidad base del insumo; precios en centavos por unidad base.
// ============================================================================

export const PO_STATUSES = ['draft', 'sent', 'partial', 'received', 'cancelled'] as const
export type PurchaseOrderStatus = (typeof PO_STATUSES)[number]

export interface IPoAllocation {
  locationId: mongoose.Types.ObjectId
  storageLocationId: mongoose.Types.ObjectId
  quantity: number
  received: number
}

export interface IPoLine {
  skuId: mongoose.Types.ObjectId
  unit: string
  /** Precio esperado por unidad base (centavos); null = a confirmar. */
  unitCostCents: number | null
  allocations: IPoAllocation[]
}

export interface IPoReceipt {
  receiptId: string
  at: Date
  by: mongoose.Types.ObjectId | null
  invoiceRef: string | null
  items: { skuId: mongoose.Types.ObjectId; storageLocationId: mongoose.Types.ObjectId; quantity: number; unitCostCents: number | null }[]
}

export interface IPoStep {
  by: mongoose.Types.ObjectId | null
  at: Date
}

export interface IPurchaseOrder extends Document {
  tenantId: mongoose.Types.ObjectId
  number: number
  supplierId: mongoose.Types.ObjectId
  status: PurchaseOrderStatus
  lines: IPoLine[]
  note: string | null
  expectedAt: Date | null
  receipts: IPoReceipt[]
  created: IPoStep
  sent: IPoStep | null
  closed: IPoStep | null
  cancelled: IPoStep | null
  /** Se cerró con mercadería sin llegar («no viene más»). */
  closedShort: boolean
  createdAt: Date
  updatedAt: Date
}

const StepSchema = new Schema<IPoStep>({ by: { type: Schema.Types.ObjectId, ref: 'User', default: null }, at: { type: Date, required: true } }, { _id: false })

const AllocationSchema = new Schema<IPoAllocation>({
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
  storageLocationId: { type: Schema.Types.ObjectId, ref: 'InventoryStorageLocation', required: true },
  quantity: { type: Number, required: true, min: 0 },
  received: { type: Number, default: 0, min: 0 },
}, { _id: false })

const LineSchema = new Schema<IPoLine>({
  skuId: { type: Schema.Types.ObjectId, ref: 'InventorySKU', required: true },
  unit: { type: String, required: true },
  unitCostCents: { type: Number, default: null, min: 0 },
  allocations: { type: [AllocationSchema], default: [] },
}, { _id: false })

const ReceiptSchema = new Schema<IPoReceipt>({
  receiptId: { type: String, required: true },
  at: { type: Date, required: true },
  by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  invoiceRef: { type: String, default: null, maxlength: 80 },
  items: [{
    _id: false,
    skuId: { type: Schema.Types.ObjectId, ref: 'InventorySKU', required: true },
    storageLocationId: { type: Schema.Types.ObjectId, ref: 'InventoryStorageLocation', required: true },
    quantity: { type: Number, required: true, min: 0 },
    unitCostCents: { type: Number, default: null },
  }],
}, { _id: false })

const PurchaseOrderSchema = new Schema<IPurchaseOrder>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  number: { type: Number, required: true },
  supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
  status: { type: String, enum: PO_STATUSES, required: true, default: 'draft' },
  lines: { type: [LineSchema], default: [] },
  note: { type: String, default: null, maxlength: 500 },
  expectedAt: { type: Date, default: null },
  receipts: { type: [ReceiptSchema], default: [] },
  created: { type: StepSchema, required: true },
  sent: { type: StepSchema, default: null },
  closed: { type: StepSchema, default: null },
  cancelled: { type: StepSchema, default: null },
  closedShort: { type: Boolean, default: false },
}, { timestamps: true, collection: 'inventory_purchase_orders' })

PurchaseOrderSchema.index({ tenantId: 1, number: 1 }, { unique: true })
PurchaseOrderSchema.index({ tenantId: 1, status: 1, updatedAt: -1 })
PurchaseOrderSchema.index({ tenantId: 1, 'lines.allocations.locationId': 1, status: 1 })
PurchaseOrderSchema.index({ tenantId: 1, supplierId: 1, createdAt: -1 })

export default (mongoose.models.PurchaseOrder as mongoose.Model<IPurchaseOrder>) ||
  mongoose.model<IPurchaseOrder>('PurchaseOrder', PurchaseOrderSchema)
