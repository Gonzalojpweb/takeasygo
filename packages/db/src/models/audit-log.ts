import mongoose, { Schema, type Document } from "mongoose"

export interface AuditLogDocument extends Document {
  tenantId: string
  category: string
  action: string
  userId: string
  deviceId?: string
  details?: Record<string, unknown>
  ip?: string
  timestamp: Date
}

export const AuditLogSchema = new Schema<AuditLogDocument>({
  tenantId: { type: String, required: true, index: true },
  category: {
    type: String,
    required: true,
    enum: [
      "authentication",
      "authorization",
      "fiscal",
      "payment",
      "security",
      "system",
    ],
  },
  action: { type: String, required: true },
  userId: { type: String, required: true },
  deviceId: { type: String },
  details: { type: Schema.Types.Mixed },
  ip: { type: String },
  timestamp: { type: Date, required: true },
})

AuditLogSchema.index({ tenantId: 1, category: 1, timestamp: -1 })
AuditLogSchema.index({ tenantId: 1, timestamp: -1 })

export const AuditLogModel = mongoose.model<AuditLogDocument>(
  "AuditLog",
  AuditLogSchema,
  "sync_audit_logs"
)
