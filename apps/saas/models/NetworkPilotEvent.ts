import mongoose, { Schema, Types } from 'mongoose'

// ============================================================================
// NetworkPilotEvent — registro del piloto (etapa 4), solo se agrega
// ============================================================================
// §8: consumidor elegible, emisor, receptor, campaña, grupo, beneficio
// emitido, canje, compra vinculada y recompra. Un evento por (asignación,
// tipo, pedido): el índice único hace idempotente el registro aunque un
// pedido se confirme dos veces o se reprocese.
//   · eligible          compra en el emisor que lo hace elegible (ambos grupos)
//   · issued            beneficio entregado (solo grupo beneficio)
//   · receiver_purchase compra en el receptor dentro de la ventana (ambos grupos)
//   · redeemed          esa compra usó la promo del piloto
//   · repurchase        compra en el receptor después de una anterior
// El emisor no ve estos datos: los lee solo el superadmin.
// ============================================================================

export type PilotEventType = 'eligible' | 'issued' | 'receiver_purchase' | 'redeemed' | 'repurchase'

export interface INetworkPilotEvent {
  _id: Types.ObjectId
  assignmentId: Types.ObjectId
  campaignId: Types.ObjectId
  consumerUserId: Types.ObjectId
  group: 'treatment' | 'control'
  type: PilotEventType
  tenantId: Types.ObjectId
  orderId: string
  /** Total del pedido en centavos (compras en el receptor). @storedAs cents */
  amountCents: number
  at: Date
}

const NetworkPilotEventSchema = new Schema<INetworkPilotEvent>({
  assignmentId: { type: Schema.Types.ObjectId, ref: 'NetworkPilotAssignment', required: true },
  campaignId: { type: Schema.Types.ObjectId, ref: 'NetworkCampaign', required: true },
  consumerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  group: { type: String, enum: ['treatment', 'control'], required: true },
  type: { type: String, enum: ['eligible', 'issued', 'receiver_purchase', 'redeemed', 'repurchase'], required: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  orderId: { type: String, required: true },
  amountCents: { type: Number, default: 0, min: 0 },
  at: { type: Date, required: true },
}, { timestamps: false })

NetworkPilotEventSchema.index({ assignmentId: 1, type: 1, orderId: 1 }, { unique: true })
NetworkPilotEventSchema.index({ campaignId: 1, type: 1 })

if (process.env.NODE_ENV !== 'production') delete (mongoose.models as Record<string, unknown>).NetworkPilotEvent
const NetworkPilotEvent = mongoose.models.NetworkPilotEvent || mongoose.model<INetworkPilotEvent>('NetworkPilotEvent', NetworkPilotEventSchema, 'network_pilot_events')
export default NetworkPilotEvent
