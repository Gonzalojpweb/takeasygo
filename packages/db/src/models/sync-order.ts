import mongoose, { Schema, type Document } from "mongoose"

export interface SyncOrderDocument extends Document {
  tenantId: string
  source: string
  status: string
  tableId?: string
  items: Array<{
    productId?: string
    name: string
    quantity: number
    unitPrice: number
    total: number
    modifiers?: Array<{ name: string; price: number }>
  }>
  total: number
  menuVersion: number
  externalOrderId?: string
  createdAt: Date
  updatedAt: Date
  syncedAt?: Date
}

export const SyncOrderSchema = new Schema<SyncOrderDocument>(
  {
    tenantId: { type: String, required: true, index: true },
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
    menuVersion: { type: Number, required: true },
    externalOrderId: { type: String },
    syncedAt: { type: Date },
  },
  { timestamps: true }
)

SyncOrderSchema.index({ tenantId: 1, createdAt: -1 })
SyncOrderSchema.index({ tenantId: 1, status: 1 })

export const SyncOrderModel = mongoose.model<SyncOrderDocument>(
  "SyncOrder",
  SyncOrderSchema,
  "sync_orders"
)
