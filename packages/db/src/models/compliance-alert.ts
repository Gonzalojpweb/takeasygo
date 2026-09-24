import mongoose, { Schema, type Document } from "mongoose"

export interface IComplianceAlertDocument extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  orderId: mongoose.Types.ObjectId
  orderNumber: string
  fromStatus: string
  toStatus: string
  level: 1 | 2 | 3
  /** Último nivel para el que se envió notificación (dedup) */
  lastNotifiedLevel: 1 | 2 | 3 | null
  lastNotificationAt: Date | null
  triggeredAt: Date
  resolvedAt: Date | null
  resolvedBy: "admin" | "client" | "system" | null
  resolution: "status_change" | "justified" | "postponed" | null
  justification?: string
  snoozedUntil?: Date
  /** true si el cliente apretó el botón de confirmación externa */
  clientConfirmed: boolean
  createdAt: Date
  updatedAt: Date
}

export const ComplianceAlertSchema = new Schema<IComplianceAlertDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Tenant",
    },
    locationId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Location",
    },
    orderId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Order",
    },
    orderNumber: { type: String, required: true },
    fromStatus: { type: String, required: true },
    toStatus: { type: String, required: true },
    level: { type: Number, required: true, enum: [1, 2, 3] },
    lastNotifiedLevel: { type: Number, enum: [1, 2, 3], default: null },
    lastNotificationAt: { type: Date, default: null },
    triggeredAt: { type: Date, required: true, default: Date.now },
    resolvedAt: { type: Date, default: null },
    resolvedBy: {
      type: String,
      enum: ["admin", "client", "system", null],
      default: null,
    },
    resolution: {
      type: String,
      enum: ["status_change", "justified", "postponed", null],
      default: null,
    },
    justification: { type: String },
    snoozedUntil: { type: Date },
    clientConfirmed: { type: Boolean, default: false },
  },
  { timestamps: true }
)

ComplianceAlertSchema.index({ tenantId: 1, locationId: 1, level: 1, resolvedAt: 1 })
ComplianceAlertSchema.index({ orderId: 1, resolvedAt: 1 })
ComplianceAlertSchema.index({ tenantId: 1, resolvedAt: 1, triggeredAt: -1 })
/** TTL: auto-eliminar alertas resueltas después de 30 días */
ComplianceAlertSchema.index(
  { resolvedAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60, partialFilterExpression: { resolvedAt: { $ne: null } } }
)

export const ComplianceAlertModel =
  (mongoose.models.ComplianceAlert as mongoose.Model<IComplianceAlertDocument>) ||
  mongoose.model<IComplianceAlertDocument>(
    "ComplianceAlert",
    ComplianceAlertSchema,
    "compliance_alerts"
  )
