import mongoose, { Schema } from 'mongoose'

const DeliveryPushSubscriptionSchema = new Schema(
  {
    deliveryTokenHash: { type: String, required: true, index: true },
    tenantId:          { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    endpoint:          { type: String, required: true },
    p256dh:            { type: String, required: true },
    auth:              { type: String, required: true },
  },
  { timestamps: true }
)

// Un delivery puede tener varias suscripciones (múltiples dispositivos)
DeliveryPushSubscriptionSchema.index({ deliveryTokenHash: 1, endpoint: 1 }, { unique: true })

export default mongoose.models.DeliveryPushSubscription ||
  mongoose.model('DeliveryPushSubscription', DeliveryPushSubscriptionSchema)
