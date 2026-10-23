import mongoose, { Schema, Document } from 'mongoose'
import type { ReferralTask } from '@/models/ReferralProgram'

// ============================================================================
// ReferralEvent — historial de puntos del programa de referidos
// ============================================================================
// Una fila por (referido, paso): índice único, así un paso nunca paga dos
// veces aunque el mismo pedido dispare la sincronización varias veces.
//
// Estados:
//   pending  → el paso ocurrió pero todavía no paga (registro sin compra)
//   credited → los puntos se sumaron al que invita
//   reverted → se cayó (pedido cancelado): los puntos se restaron
// Un paso revertido puede volver a acreditarse si otro pedido lo cumple.
// Los puntos se congelan al crear la fila: un cambio posterior de la
// configuración no altera lo ya ganado.
// ============================================================================

export type ReferralEventStatus = 'pending' | 'credited' | 'reverted'

export interface IReferralEvent extends Document {
  tenantId: mongoose.Types.ObjectId
  referralId: mongoose.Types.ObjectId
  referrerMemberId: mongoose.Types.ObjectId
  task: ReferralTask
  /** Not cents — stored as points. */
  points: number
  status: ReferralEventStatus
  /** Pedido que cumplió el paso (null en el registro mientras está pendiente). */
  orderId: mongoose.Types.ObjectId | null
  creditedAt: Date | null
  revertedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const ReferralEventSchema = new Schema<IReferralEvent>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    referralId: { type: Schema.Types.ObjectId, ref: 'Referral', required: true },
    referrerMemberId: { type: Schema.Types.ObjectId, ref: 'LoyaltyMember', required: true },
    task: { type: String, enum: ['registered', 'first_online_order', 'visit', 'second_order'], required: true },
    points: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pending', 'credited', 'reverted'], default: 'pending' },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    creditedAt: { type: Date, default: null },
    revertedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

ReferralEventSchema.index({ referralId: 1, task: 1 }, { unique: true })
ReferralEventSchema.index({ tenantId: 1, referrerMemberId: 1, status: 1 })

const ReferralEvent =
  (mongoose.models.ReferralEvent as mongoose.Model<IReferralEvent>) ||
  mongoose.model<IReferralEvent>('ReferralEvent', ReferralEventSchema)

export default ReferralEvent
