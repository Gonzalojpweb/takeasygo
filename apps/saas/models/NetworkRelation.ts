import mongoose, { Schema, Types } from 'mongoose'

// ============================================================================
// NetworkRelation — quién puede distribuir beneficios de quién (§3.1–3.3)
// ============================================================================
// Una relación es DIRIGIDA: el emisor entrega a sus clientes beneficios para
// usar en el receptor. La inversa es otra relación, independiente: la
// reciprocidad se configura por separado y nunca es obligatoria.
// La crea y pausa el superadmin (sin relaciones automáticas en la etapa 3).
// ============================================================================

export interface INetworkRelation {
  _id: Types.ObjectId
  emitterTenantId: Types.ObjectId
  receiverTenantId: Types.ObjectId
  status: 'active' | 'paused'
  createdBy: string
  note: string
  createdAt: Date
  updatedAt: Date
}

const NetworkRelationSchema = new Schema<INetworkRelation>({
  emitterTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  receiverTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  status: { type: String, enum: ['active', 'paused'], default: 'active' },
  createdBy: { type: String, required: true },
  note: { type: String, default: '', maxlength: 500 },
}, { timestamps: true })

NetworkRelationSchema.index({ emitterTenantId: 1, receiverTenantId: 1 }, { unique: true })
NetworkRelationSchema.index({ receiverTenantId: 1, status: 1 })

if (process.env.NODE_ENV !== 'production') delete (mongoose.models as Record<string, unknown>).NetworkRelation
const NetworkRelation = mongoose.models.NetworkRelation || mongoose.model<INetworkRelation>('NetworkRelation', NetworkRelationSchema, 'network_relations')
export default NetworkRelation
