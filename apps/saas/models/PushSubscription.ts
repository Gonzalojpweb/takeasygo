import mongoose, { Schema } from 'mongoose'

const PushSubscriptionSchema = new Schema(
  {
    // Token único por dispositivo, guardado en localStorage del consumer
    clientToken: { type: String, required: true },
    endpoint:    { type: String, required: true },
    p256dh:      { type: String, required: true },
    auth:        { type: String, required: true },
    // Opcional: asociado a un tenant cuando viene de un pedido
    tenantId:    { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
    // Opcional: asociado a un miembro del club de fidelización
    memberId:    { type: Schema.Types.ObjectId, ref: 'LoyaltyMember', index: true },
    // Hash del teléfono para vincular a Consumer/LoyaltyMember sin exponer PII
    phoneHash:   { type: String, index: true },
    // ── Aislamiento por sede (solo subs de panel admin) ────────────────────
    // Stampeados server-side en /api/push/subscribe cuando hay sesión de
    // panel. sendAdminPushNotification usa role/assignedLocations para no
    // enviar pedidos de otras sedes a managers/cashiers scoped. Los subs
    // legacy (sin stamp) reciben todo hasta re-suscribirse.
    userId:            { type: Schema.Types.ObjectId, ref: 'User' },
    role:              { type: String },
    assignedLocations: [{ type: String }],
  },
  { timestamps: true }
)

// Un dispositivo puede reusar el mismo endpoint — upsert por clientToken
PushSubscriptionSchema.index({ clientToken: 1 }, { unique: true })
// Índice compuesto para buscar subscriptions por tenant + phoneHash
PushSubscriptionSchema.index({ tenantId: 1, phoneHash: 1 })

export default mongoose.models.PushSubscription ||
  mongoose.model('PushSubscription', PushSubscriptionSchema)
