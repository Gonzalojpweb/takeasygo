import mongoose, { Schema, Document } from 'mongoose'

export interface IAuditLog extends Document {
  tenantId: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId | null
  userName: string
  userRole: string
  action: string
  entity: string
  entityId: string | null
  details: Record<string, any>
  ip: string
  createdAt: Date
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    userName: { type: String, default: '' },
    userRole: { type: String, default: '' },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: String, default: null },
    details: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
  },
  { timestamps: true, versionKey: false }
)

AuditLogSchema.index({ tenantId: 1, createdAt: -1 })

const AuditLog =
  mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema)
export default AuditLog
