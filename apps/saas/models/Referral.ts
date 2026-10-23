import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// Referral — quién invitó a quién (una fila por invitado)
// ============================================================================
// · Un invitado tiene UN solo referidor: índice único (tenantId, inviteeMemberId).
// · `inviteePhoneHash` es la llave para encontrar los pedidos del invitado
//   (Order.customer.phoneHash usa el mismo hashPhone de lib/crypto).
// · El avance de cada paso vive en ReferralEvent (historial con estados);
//   acá queda el resumen y el estado del premio final.
// · Estado del premio (máquina simple, sin dobles entregas):
//     none → granting → granted   (se entrega una vez)
//     granted → revoked           (se cayó un paso y el canje seguía sin usar)
//     revoked → granting          (vuelve a completar el recorrido)
// ============================================================================

export type ReferralStatus = 'active' | 'completed'
export type ReferralRewardState = 'none' | 'granting' | 'granted' | 'revoked'

export interface IReferral extends Document {
  tenantId: mongoose.Types.ObjectId
  referrerMemberId: mongoose.Types.ObjectId
  inviteeMemberId: mongoose.Types.ObjectId
  inviteePhoneHash: string
  /** Código del link que se usó (auditoría). */
  code: string
  status: ReferralStatus
  /** Cuándo se sumó el invitado. Los pedidos cuentan desde acá (con un margen chico para el checkout). */
  joinedAt: Date
  completedAt: Date | null
  reward: {
    state: ReferralRewardState
    storeItemId: mongoose.Types.ObjectId | null
    redemptionId: mongoose.Types.ObjectId | null
    grantedAt: Date | null
    revokedAt: Date | null
  }
  /** Lo que gastó el invitado en pedidos que cuentan (productos, sin envío). @storedAs cents */
  spentCents: number
  lastSyncedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const ReferralSchema = new Schema<IReferral>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    referrerMemberId: { type: Schema.Types.ObjectId, ref: 'LoyaltyMember', required: true },
    inviteeMemberId: { type: Schema.Types.ObjectId, ref: 'LoyaltyMember', required: true },
    inviteePhoneHash: { type: String, required: true },
    code: { type: String, required: true },
    status: { type: String, enum: ['active', 'completed'], default: 'active' },
    joinedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    reward: {
      state: { type: String, enum: ['none', 'granting', 'granted', 'revoked'], default: 'none' },
      storeItemId: { type: Schema.Types.ObjectId, ref: 'StoreItem', default: null },
      redemptionId: { type: Schema.Types.ObjectId, ref: 'StoreRedemption', default: null },
      grantedAt: { type: Date, default: null },
      revokedAt: { type: Date, default: null },
    },
    spentCents: { type: Number, default: 0, min: 0 },
    lastSyncedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

// Un solo referidor por invitado.
ReferralSchema.index({ tenantId: 1, inviteeMemberId: 1 }, { unique: true })
// Pedido entregado/cancelado → referidos de ese teléfono.
ReferralSchema.index({ tenantId: 1, inviteePhoneHash: 1 })
// Pantalla «Invitá y ganá», límite mensual y ranking.
ReferralSchema.index({ tenantId: 1, referrerMemberId: 1, createdAt: -1 })
// Barrido del cron de respaldo.
ReferralSchema.index({ status: 1, joinedAt: -1 })

const Referral =
  (mongoose.models.Referral as mongoose.Model<IReferral>) ||
  mongoose.model<IReferral>('Referral', ReferralSchema)

export default Referral
