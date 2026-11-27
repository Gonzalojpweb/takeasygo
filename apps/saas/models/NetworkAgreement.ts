import mongoose, { Schema, Types } from 'mongoose'

// ============================================================================
// NetworkAgreement — acuerdo comercial con un comercio receptor (§4, §4.1)
// ============================================================================
// No hay porcentaje universal: cada acuerdo lo define el superadmin.
//   · Versionado: modificar un acuerdo NO lo pisa. Se cierra la versión vigente
//     (validTo + status 'superseded') y se crea una nueva (version + 1,
//     previousId). Cada canje guardará la versión que le correspondió (etapa 5),
//     así un cambio futuro nunca altera comisiones pasadas.
//   · Alcance: 'receiver' (todo el comercio), 'relation' (un emisor puntual) o
//     'campaign' (una campaña). Al canjear se usa el más específico vigente.
//   · La comisión la paga el RECEPTOR, solo por canje válido con compra real.
// Importes en centavos; porcentaje como número (5 = 5 %).
// ============================================================================

export type AgreementScope = 'receiver' | 'relation' | 'campaign'
export type CommissionBase = 'purchase_total' | 'discounted_total'

export interface INetworkAgreement {
  _id: Types.ObjectId
  receiverTenantId: Types.ObjectId
  scope: AgreementScope
  relationId: Types.ObjectId | null
  campaignId: Types.ObjectId | null
  commissionPercent: number
  /** purchase_total = total de la compra antes del beneficio; discounted_total = lo que pagó el cliente. */
  commissionBase: CommissionBase
  /** Tope de comisión por operación en centavos (null = sin tope). @storedAs cents */
  capPerOperationCents: number | null
  /** Deuda máxima permitida antes de suspender la recepción en centavos. @storedAs cents */
  debtThresholdCents: number
  settlement: 'weekly'
  validFrom: Date
  validTo: Date | null
  status: 'active' | 'superseded' | 'ended'
  version: number
  previousId: Types.ObjectId | null
  createdBy: string
  note: string
  createdAt: Date
  updatedAt: Date
}

const NetworkAgreementSchema = new Schema<INetworkAgreement>({
  receiverTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  scope: { type: String, enum: ['receiver', 'relation', 'campaign'], default: 'receiver' },
  relationId: { type: Schema.Types.ObjectId, ref: 'NetworkRelation', default: null },
  campaignId: { type: Schema.Types.ObjectId, ref: 'NetworkCampaign', default: null },
  commissionPercent: { type: Number, required: true, min: 0, max: 100 },
  commissionBase: { type: String, enum: ['purchase_total', 'discounted_total'], default: 'discounted_total' },
  capPerOperationCents: { type: Number, default: null, min: 0 },
  debtThresholdCents: { type: Number, required: true, min: 0 },
  settlement: { type: String, enum: ['weekly'], default: 'weekly' },
  validFrom: { type: Date, required: true },
  validTo: { type: Date, default: null },
  status: { type: String, enum: ['active', 'superseded', 'ended'], default: 'active' },
  version: { type: Number, required: true, min: 1 },
  previousId: { type: Schema.Types.ObjectId, ref: 'NetworkAgreement', default: null },
  createdBy: { type: String, required: true },
  note: { type: String, default: '', maxlength: 1000 },
}, { timestamps: true })

NetworkAgreementSchema.index({ receiverTenantId: 1, scope: 1, relationId: 1, campaignId: 1, status: 1 })
NetworkAgreementSchema.index({ receiverTenantId: 1, createdAt: -1 })

if (process.env.NODE_ENV !== 'production') delete (mongoose.models as Record<string, unknown>).NetworkAgreement
const NetworkAgreement = mongoose.models.NetworkAgreement || mongoose.model<INetworkAgreement>('NetworkAgreement', NetworkAgreementSchema, 'network_agreements')
export default NetworkAgreement
