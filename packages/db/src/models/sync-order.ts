import mongoose, { Schema, type Document } from "mongoose"

export interface SyncOrderDocument extends Document {
  tenantId: string
  /** ObjectId de la sede (apps/saas Location). Presente en órdenes multi-sede. */
  locationId?: string
  source: string
  status: string
  tableId?: string
  items: Array<{
    productId?: string
    name: string
    quantity: number
    /** Precio unitario en centavos. @storedAs cents */
    unitPrice: number
    /** Total del ítem en centavos. @storedAs cents */
    total: number
    modifiers?: Array<{ name: string; /** @storedAs cents */ price: number }>
  }>
  /** Total de la orden en centavos. @storedAs cents */
  total: number
  /** Base total antes de recargo en centavos. @storedAs cents */
  baseTotal?: number
  /** Monto del recargo en centavos. @storedAs cents */
  surchargeAmount?: number
  menuVersion: number
  externalOrderId?: string
  paymentMethod?: string
  createdAt: Date
  updatedAt: Date
  syncedAt?: Date
}

export const SyncOrderSchema = new Schema<SyncOrderDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    locationId: { type: String },
    source: { type: String, required: true, enum: ["takeasygo", "pos"] },
    status: {
      type: String,
      required: true,
      enum: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "delivered",
        "cancelled",
        "requires_manual_attention",
      ],
    },
    tableId: { type: String },
    items: [
      {
        productId: { type: String },
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        unitPrice: { type: Number, required: true },
        total: { type: Number, required: true },
        modifiers: [
          {
            name: { type: String, required: true },
            price: { type: Number, required: true },
          },
        ],
      },
    ],
    total: { type: Number, required: true },
    baseTotal: { type: Number, default: 0 },
    surchargeAmount: { type: Number, default: 0 },
    menuVersion: { type: Number, required: true },
    externalOrderId: { type: String },
    paymentMethod: { type: String },
    syncedAt: { type: Date },
  },
  { timestamps: true }
)

SyncOrderSchema.index({ tenantId: 1, createdAt: -1 })
SyncOrderSchema.index({ tenantId: 1, status: 1 })
SyncOrderSchema.index({ tenantId: 1, locationId: 1, createdAt: -1 })
SyncOrderSchema.index({ tenantId: 1, externalOrderId: 1 }, { unique: true, sparse: true })

export const SyncOrderModel = mongoose.model<SyncOrderDocument>(
  "SyncOrder",
  SyncOrderSchema,
  "sync_orders"
)
