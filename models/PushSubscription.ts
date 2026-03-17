import mongoose, { Schema } from 'mongoose'

const PushSubscriptionSchema = new Schema(
  {
    // Token único por dispositivo, guardado en localStorage del consumer
    clientToken: { type: String, required: true, index: true },
    endpoint:    { type: String, required: true },
    p256dh:      { type: String, required: true },
    auth:        { type: String, required: true },
    // Opcional: asociado a un tenant cuando viene de un pedido
    tenantId:    { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
  },
  { timestamps: true }
)

// Un dispositivo puede reusar el mismo endpoint — upsert por clientToken
PushSubscriptionSchema.index({ clientToken: 1 }, { unique: true })

export default mongoose.models.PushSubscription ||
  mongoose.model('PushSubscription', PushSubscriptionSchema)
