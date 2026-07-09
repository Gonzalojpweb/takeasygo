import mongoose, { Schema, Document } from 'mongoose'

export type PushTargetType = 'all_members' | 'all_consumers' | 'specific_members' | 'specific_consumers' | 'global_broadcast'

export interface IPushNotificationLog extends Document {
  tenantId?: mongoose.Types.ObjectId
  sentBy: mongoose.Types.ObjectId
  sentByRole: 'admin' | 'manager' | 'superadmin'
  title: string
  body: string
  url?: string
  targetType: PushTargetType
  targetCount: number
  successCount: number
  failCount: number
  createdAt: Date
}

const PushNotificationLogSchema = new Schema<IPushNotificationLog>(
  {
    tenantId:  { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
    sentBy:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sentByRole:{ type: String, enum: ['admin', 'manager', 'superadmin'], required: true },
    title:     { type: String, required: true },
    body:      { type: String, required: true },
    url:       { type: String, default: '' },
    targetType:{ type: String, enum: ['all_members', 'all_consumers', 'specific_members', 'specific_consumers', 'global_broadcast'], required: true },
    targetCount:{ type: Number, default: 0 },
    successCount:{ type: Number, default: 0 },
    failCount:{ type: Number, default: 0 },
  },
  { timestamps: true }
)

PushNotificationLogSchema.index({ tenantId: 1, createdAt: -1 })
PushNotificationLogSchema.index({ sentBy: 1, createdAt: -1 })

export default mongoose.models.PushNotificationLog ||
  mongoose.model<IPushNotificationLog>('PushNotificationLog', PushNotificationLogSchema)
