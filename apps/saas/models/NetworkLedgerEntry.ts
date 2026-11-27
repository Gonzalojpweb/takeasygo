import mongoose, { Schema, Types } from 'mongoose'

// ============================================================================
// NetworkLedgerEntry — movimientos económicos de la red (etapa 5), inmutables
// ============================================================================
// Informe 21/11/2026, §4, §9 y §10:
//   · Un canje válido genera UNA entrada 'commission' (idempotencyKey única):
//     guarda la versión del acuerdo que regía, la base, el porcentaje, el tope
//     y los importes. Un cambio futuro del acuerdo no la altera.
//   · Una cancelación o devolución genera una entrada 'reversal' con importes
//     negativos (nunca se edita ni borra la original).
//   · La comisión de red es distinta de la comisión habitual de TakeasyGO y se
//     liquida aparte (etapa 6: cobro automático o saldo semanal).
//   · No hay updates: el modelo bloquea modificaciones de documentos guardados.
// Importes en centavos.
// ============================================================================

export interface INetworkLedgerEntry {
  _id: Types.ObjectId
  type: 'commission' | 'reversal'
  idempotencyKey: string
  benefitId: Types.ObjectId
  campaignId: Types.ObjectId
  relationId: Types.ObjectId
  emitterTenantId: Types.ObjectId
  receiverTenantId: Types.ObjectId
  consumerUserId: Types.ObjectId
  agreementId: Types.ObjectId | null
  agreementVersion: number | null
  commissionPercent: number
  commissionBase: 'purchase_total' | 'discounted_total'
  capPerOperationCents: number | null
  /** @storedAs cents */
  purchaseTotalCents: number
  /** @storedAs cents */
  discountCents: number
  /** @storedAs cents */
  discountedTotalCents: number
  /** Comisión de red a cargo del receptor (negativa en una reversión). @storedAs cents */
  commissionCents: number
  /** Operación de venta del receptor (n.º de pedido o ticket). */
  saleRef: string
  /** Para una reversión: la entrada que revierte. */
  reversesId: Types.ObjectId | null
  reason: string
  createdBy: string
  createdAt: Date
}

const NetworkLedgerEntrySchema = new Schema<INetworkLedgerEntry>({
  type: { type: String, enum: ['commission', 'reversal'], required: true },
  idempotencyKey: { type: String, required: true },
  benefitId: { type: Schema.Types.ObjectId, ref: 'NetworkBenefit', required: true },
  campaignId: { type: Schema.Types.ObjectId, ref: 'NetworkCampaign', required: true },
  relationId: { type: Schema.Types.ObjectId, ref: 'NetworkRelation', required: true },
  emitterTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  receiverTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  consumerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  agreementId: { type: Schema.Types.ObjectId, ref: 'NetworkAgreement', default: null },
  agreementVersion: { type: Number, default: null },
  commissionPercent: { type: Number, required: true },
  commissionBase: { type: String, enum: ['purchase_total', 'discounted_total'], required: true },
  capPerOperationCents: { type: Number, default: null },
  purchaseTotalCents: { type: Number, required: true },
  discountCents: { type: Number, required: true },
  discountedTotalCents: { type: Number, required: true },
  commissionCents: { type: Number, required: true },
  saleRef: { type: String, default: '', maxlength: 80 },
  reversesId: { type: Schema.Types.ObjectId, ref: 'NetworkLedgerEntry', default: null },
  reason: { type: String, default: '', maxlength: 300 },
  createdBy: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } })

NetworkLedgerEntrySchema.index({ idempotencyKey: 1 }, { unique: true })
NetworkLedgerEntrySchema.index({ receiverTenantId: 1, createdAt: -1 })
NetworkLedgerEntrySchema.index({ campaignId: 1, type: 1 })

// Inmutable: un movimiento guardado no se modifica (las correcciones son reversiones).
NetworkLedgerEntrySchema.pre('save', function () {
  if (!this.isNew) throw new Error('Los movimientos de la red no se modifican: registrá una reversión')
})
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'] as const) {
  NetworkLedgerEntrySchema.pre(op, function () {
    throw new Error('Los movimientos de la red no se modifican: registrá una reversión')
  })
}

if (process.env.NODE_ENV !== 'production') delete (mongoose.models as Record<string, unknown>).NetworkLedgerEntry
const NetworkLedgerEntry = mongoose.models.NetworkLedgerEntry || mongoose.model<INetworkLedgerEntry>('NetworkLedgerEntry', NetworkLedgerEntrySchema, 'network_ledger')
export default NetworkLedgerEntry
