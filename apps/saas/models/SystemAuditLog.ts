import mongoose, { Schema, Document } from 'mongoose'

/**
 * Auditoría de sistema (sin comercio): acciones del SuperAdmin y eventos de
 * seguridad (`security.*`). AuditLog es por comercio y descartaba todo lo que
 * venía con tenantId nulo, así que el SuperAdmin no dejaba rastro.
 *
 * Se escribe solo desde lib/audit.ts (eventos superadmin/seguridad) y desde el
 * script offline de recuperación. Nunca se guardan secretos ni códigos.
 */
export interface ISystemAuditLog extends Document {
  userId: mongoose.Types.ObjectId | null
  userName: string
  userRole: string
  action: string
  entity: string
  entityId: string | null
  details: Record<string, unknown>
  ip: string
  userAgent: string
  createdAt: Date
}

const SystemAuditLogSchema = new Schema<ISystemAuditLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    userName: { type: String, default: '' },
    userRole: { type: String, default: '' },
    action: { type: String, required: true, index: true },
    entity: { type: String, required: true },
    entityId: { type: String, default: null },
    details: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'systemauditlogs' }
)

SystemAuditLogSchema.index({ createdAt: -1 })

const SystemAuditLog =
  mongoose.models.SystemAuditLog || mongoose.model<ISystemAuditLog>('SystemAuditLog', SystemAuditLogSchema)
export default SystemAuditLog
