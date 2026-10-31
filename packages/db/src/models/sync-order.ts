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
  customerId?: string
  notes?: string
  paymentMethod?: string
  /** Modo del pedido en el SaaS (dine-in | takeaway | delivery | business). */
  orderMode?: string
  /**
   * Pedidos App (30/10/2026): lo que el POS muestra para atenderlo — número
   * del pedido, cliente y entrega. Viene del SaaS; datos personales mínimos
   * (nombre, teléfono, dirección) que el comercio necesita para entregar.
   */
  display?: {
    orderNumber?: string
    customerName?: string
    customerPhone?: string
    deliveryAddress?: string
    deliveryReference?: string
  }
  /** B1: true si locationId fue inferido en backfill (no viene del dato original). */
  locationInferred?: boolean
  /** B1: motivo de la inferencia de sede (backfill). */
  locationInferenceReason?: string
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
    customerId: { type: String },
    notes: { type: String },
    paymentMethod: { type: String },
    orderMode: { type: String },
    display: {
      type: new Schema({
        orderNumber: { type: String, maxlength: 40 },
        customerName: { type: String, maxlength: 120 },
        customerPhone: { type: String, maxlength: 40 },
        deliveryAddress: { type: String, maxlength: 240 },
        deliveryReference: { type: String, maxlength: 240 },
      }, { _id: false }),
      default: undefined,
    },
    // B1 sede en sync_orders: marca de inferencia en backfill.
    locationInferred: { type: Boolean, default: false },
    locationInferenceReason: { type: String },
    syncedAt: { type: Date },
  },
  { timestamps: true }
)

SyncOrderSchema.index({ tenantId: 1, createdAt: -1 })
SyncOrderSchema.index({ tenantId: 1, status: 1 })
SyncOrderSchema.index({ tenantId: 1, locationId: 1, createdAt: -1 })
SyncOrderSchema.index({ tenantId: 1, externalOrderId: 1 }, { unique: true, sparse: true })

export const SyncOrderModel =
  (mongoose.models.SyncOrder as mongoose.Model<SyncOrderDocument>) ||
  mongoose.model<SyncOrderDocument>("SyncOrder", SyncOrderSchema, "sync_orders")
