import mongoose, { Schema, type Model } from 'mongoose'

export interface ISecurityAlertThrottle {
  _id: mongoose.Types.ObjectId
  /** Clave única: `${tenantSlug}:${alertType}` */
  key: string
  lastSentAt: Date
  createdAt: Date
  updatedAt: Date
}

const SecurityAlertThrottleSchema = new Schema<ISecurityAlertThrottle>(
  {
    key: { type: String, required: true, unique: true },
    lastSentAt: { type: Date, required: true },
  },
  { timestamps: true }
)

SecurityAlertThrottleSchema.index({ lastSentAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 })

const SecurityAlertThrottle: Model<ISecurityAlertThrottle> =
  (mongoose.models.SecurityAlertThrottle as Model<ISecurityAlertThrottle>) ||
  mongoose.model<ISecurityAlertThrottle>('SecurityAlertThrottle', SecurityAlertThrottleSchema)

export default SecurityAlertThrottle
