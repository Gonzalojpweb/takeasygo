import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// ReferralProgram — configuración del programa «Invitá y ganá» de un comercio
// ============================================================================
// Una por comercio (índice único por tenantId). Vive en su propia colección
// para no seguir agrandando Tenant y para poder versionar la campaña sin
// tocar el documento del comercio.
//
// El que invita gana puntos por cada paso de su invitado y, al completar
// todos los pasos activos, el premio (un artículo de la tienda del club que
// se le entrega sin costo). El invitado recibe los puntos de bienvenida que
// el comercio ya tiene configurados en el club (pointsConfig.welcomePoints):
// no hay un beneficio aparte para él.
// ============================================================================

export type ReferralTask = 'registered' | 'first_online_order' | 'visit' | 'second_order'

/** Orden del recorrido (también el orden en que se muestran). */
export const REFERRAL_TASKS: readonly ReferralTask[] = ['registered', 'first_online_order', 'visit', 'second_order'] as const

export interface IReferralTaskConfig {
  enabled: boolean
  /** Puntos para el que invita. Not cents — stored as points. */
  points: number
}

export interface IReferralProgram extends Document {
  tenantId: mongoose.Types.ObjectId
  enabled: boolean
  tasks: Record<ReferralTask, IReferralTaskConfig>
  /** Premio final: artículo de la tienda del club (StoreItem). null = solo puntos. */
  rewardStoreItemId: mongoose.Types.ObjectId | null
  /** Días que el premio queda disponible para canjear en el local. */
  rewardValidityDays: number
  /** Plazo (días desde la primera compra) para que la segunda compra cuente. */
  secondOrderWindowDays: number
  /** Invitados nuevos por miembro en 30 días. 0 = sin límite. */
  monthlyInviteLimit: number
  /** Vigencia de la campaña (null = sin fecha). Fuera de fecha no se suman invitados nuevos. */
  startsAt: Date | null
  endsAt: Date | null
  updatedBy: string | null
  createdAt: Date
  updatedAt: Date
}

const TaskSchema = new Schema<IReferralTaskConfig>(
  {
    enabled: { type: Boolean, default: true },
    points: { type: Number, default: 0, min: 0, max: 100_000 },
  },
  { _id: false },
)

const ReferralProgramSchema = new Schema<IReferralProgram>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
    enabled: { type: Boolean, default: false },
    tasks: {
      registered: { type: TaskSchema, default: () => ({ enabled: true, points: 50 }) },
      first_online_order: { type: TaskSchema, default: () => ({ enabled: true, points: 100 }) },
      visit: { type: TaskSchema, default: () => ({ enabled: true, points: 100 }) },
      second_order: { type: TaskSchema, default: () => ({ enabled: true, points: 150 }) },
    },
    rewardStoreItemId: { type: Schema.Types.ObjectId, ref: 'StoreItem', default: null },
    rewardValidityDays: { type: Number, default: 30, min: 1, max: 365 },
    secondOrderWindowDays: { type: Number, default: 30, min: 1, max: 365 },
    monthlyInviteLimit: { type: Number, default: 20, min: 0, max: 1000 },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
)

const ReferralProgram =
  (mongoose.models.ReferralProgram as mongoose.Model<IReferralProgram>) ||
  mongoose.model<IReferralProgram>('ReferralProgram', ReferralProgramSchema)

export default ReferralProgram
