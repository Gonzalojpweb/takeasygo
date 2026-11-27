import mongoose, { Schema, Types } from 'mongoose'

// ============================================================================
// NetworkPilotAssignment — grupo de cada consumidor en un piloto (etapa 4)
// ============================================================================
// Informe 21/11/2026, §8: la asignación es PERSISTENTE por consumidor y por
// relación comercial dentro del experimento (campaña). Una persona no puede
// quedar en beneficio en una compra y en control en otra: el índice único
// (campaña, relación, consumidor) lo garantiza y el grupo nunca se recalcula.
// El consumidor es la cuenta global con email verificado (§5), nunca un
// teléfono sin verificar.
// ============================================================================

export type PilotGroup = 'treatment' | 'control'

export interface INetworkPilotAssignment {
  _id: Types.ObjectId
  campaignId: Types.ObjectId
  relationId: Types.ObjectId
  emitterTenantId: Types.ObjectId
  receiverTenantId: Types.ObjectId
  consumerUserId: Types.ObjectId
  group: PilotGroup
  controlPercent: number
  assignedAt: Date
  firstEligibleOrderId: string
  createdAt: Date
  updatedAt: Date
}

const NetworkPilotAssignmentSchema = new Schema<INetworkPilotAssignment>({
  campaignId: { type: Schema.Types.ObjectId, ref: 'NetworkCampaign', required: true },
  relationId: { type: Schema.Types.ObjectId, ref: 'NetworkRelation', required: true },
  emitterTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  receiverTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  consumerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  group: { type: String, enum: ['treatment', 'control'], required: true },
  controlPercent: { type: Number, required: true },
  assignedAt: { type: Date, required: true },
  firstEligibleOrderId: { type: String, required: true },
}, { timestamps: true })

NetworkPilotAssignmentSchema.index({ campaignId: 1, relationId: 1, consumerUserId: 1 }, { unique: true })
NetworkPilotAssignmentSchema.index({ consumerUserId: 1, receiverTenantId: 1 })

if (process.env.NODE_ENV !== 'production') delete (mongoose.models as Record<string, unknown>).NetworkPilotAssignment
const NetworkPilotAssignment = mongoose.models.NetworkPilotAssignment || mongoose.model<INetworkPilotAssignment>('NetworkPilotAssignment', NetworkPilotAssignmentSchema, 'network_pilot_assignments')
export default NetworkPilotAssignment
