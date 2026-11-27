import mongoose, { Schema, Types } from 'mongoose'

// ============================================================================
// NetworkMember — participación de un comercio en la red de beneficios
// ============================================================================
// Informe 21/11/2026, §3.3 y §4.5 (etapa 3):
//   · La incorporación la controla el superadmin: pending → active, y puede
//     suspenderla. En esta etapa nada se crea solo.
//   · canEmit / canReceive por separado: recibir no obliga a emitir.
//   · receiverSuspension: el superadmin (o, en la etapa 6, el control de deuda)
//     corta la EMISIÓN DE NUEVOS beneficios hacia el comercio. Afecta solo a la
//     red: nunca al POS, las ventas, el catálogo ni el SaaS.
//   · history: registro de cada cambio de estado (quién, cuándo, por qué).
// ============================================================================

export type NetworkMemberStatus = 'pending' | 'active' | 'suspended'

export interface INetworkMemberEvent {
  at: Date
  by: string
  action: string
  note: string
}

export interface INetworkMember {
  _id: Types.ObjectId
  tenantId: Types.ObjectId
  status: NetworkMemberStatus
  canEmit: boolean
  canReceive: boolean
  /** Emisión de nuevos beneficios hacia este comercio suspendida (deuda u otro motivo). */
  receiverSuspension: { at: Date; by: string; reason: 'debt' | 'other'; note: string } | null
  approvedAt: Date | null
  approvedBy: string | null
  notes: string
  history: INetworkMemberEvent[]
  createdAt: Date
  updatedAt: Date
}

const EventSchema = new Schema<INetworkMemberEvent>({
  at: { type: Date, required: true },
  by: { type: String, required: true },
  action: { type: String, required: true },
  note: { type: String, default: '' },
}, { _id: false })

const NetworkMemberSchema = new Schema<INetworkMember>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  status: { type: String, enum: ['pending', 'active', 'suspended'], default: 'pending' },
  canEmit: { type: Boolean, default: true },
  canReceive: { type: Boolean, default: true },
  receiverSuspension: {
    type: new Schema({
      at: { type: Date, required: true },
      by: { type: String, required: true },
      reason: { type: String, enum: ['debt', 'other'], required: true },
      note: { type: String, default: '' },
    }, { _id: false }),
    default: null,
  },
  approvedAt: { type: Date, default: null },
  approvedBy: { type: String, default: null },
  notes: { type: String, default: '', maxlength: 1000 },
  history: { type: [EventSchema], default: [] },
}, { timestamps: true })

NetworkMemberSchema.index({ tenantId: 1 }, { unique: true })
NetworkMemberSchema.index({ status: 1 })

if (process.env.NODE_ENV !== 'production') delete (mongoose.models as Record<string, unknown>).NetworkMember
const NetworkMember = mongoose.models.NetworkMember || mongoose.model<INetworkMember>('NetworkMember', NetworkMemberSchema, 'network_members')
export default NetworkMember
