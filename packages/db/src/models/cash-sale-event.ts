import mongoose, { Schema, type Document } from "mongoose"

export interface CashSaleEventDocument extends Document {
  orderId: string
  tenantId: string
  /** Monto de la venta en centavos. @storedAs cents */
  amount: number
  paymentMethod: string
  orderMode: string
  timestamp: Date
  source: string
  status: "pending" | "delivered" | "failed"
  attempts: number
  lastAttemptAt?: Date
  lastError?: string
  createdAt: Date
}

export const CashSaleEventSchema = new Schema<CashSaleEventDocument>(
  {
    orderId: { type: String, required: true },
    tenantId: { type: String, required: true },
    amount: { type: Number, required: true },
    paymentMethod: { type: String, required: true },
    orderMode: { type: String, required: true },
    timestamp: { type: Date, required: true },
    source: { type: String, required: true, default: "sync_layer" },
    status: {
      type: String,
      required: true,
      enum: ["pending", "delivered", "failed"],
      default: "pending",
    },
    attempts: { type: Number, required: true, default: 0 },
    lastAttemptAt: { type: Date },
    lastError: { type: String },
  },
  { timestamps: true }
)

CashSaleEventSchema.index({ orderId: 1, tenantId: 1 }, { unique: true })
CashSaleEventSchema.index({ status: 1, tenantId: 1 })
CashSaleEventSchema.index({ tenantId: 1, createdAt: -1 })

export const CashSaleEventModel = mongoose.model<CashSaleEventDocument>(
  "CashSaleEvent",
  CashSaleEventSchema,
  "cash_sale_events"
)
