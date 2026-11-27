import mongoose, { Schema, Types } from 'mongoose'

// ============================================================================
// NetworkBenefit — beneficio de la red en la cuenta de un consumidor (etapa 5)
// ============================================================================
// Informe 21/11/2026, §5 y §6:
//   · Pertenece a una cuenta global con email verificado (consumerUserId),
//     nunca a un teléfono ni a una captura. Si quien compró no tenía cuenta,
//     nace «pending_claim» con un token de un solo uso (72 h) que se reclama
//     al iniciar sesión con el MISMO email del pedido.
//   · Se canjea con un QR dinámico (código que cambia cada 30 s, HOTP con un
//     secreto propio cifrado) o con el código manual «REF-123456».
//   · issued → redeemed es atómico (un solo canje aunque lleguen dos pedidos a
//     la vez). Un canje revertido no vuelve a quedar disponible.
//   · Guarda una copia del beneficio y el origen (emisor, pedido, campaña,
//     relación): la atribución se conserva aunque cambie la campaña.
// ============================================================================

export type BenefitStatus = 'pending_claim' | 'issued' | 'redeemed' | 'reversed' | 'expired' | 'revoked'

export interface INetworkBenefit {
  _id: Types.ObjectId
  /** Referencia corta para el código manual (8 caracteres, única). */
  ref: string
  consumerUserId: Types.ObjectId | null
  campaignId: Types.ObjectId
  relationId: Types.ObjectId
  emitterTenantId: Types.ObjectId
  receiverTenantId: Types.ObjectId
  sourceOrderId: string
  status: BenefitStatus
  benefit: { type: 'percent' | 'fixed'; value: number; maxDiscountCents: number | null; minPurchaseCents: number }
  title: string
  issuedAt: Date
  expiresAt: Date
  /** Secreto HOTP del QR, cifrado (AES-256-GCM). @storedAs encrypted */
  secretEnc: string
  /** Reclamo sin cuenta: hash SHA-256 del token y vencimiento (72 h). */
  claimTokenHash: string | null
  /** Token de reclamo cifrado (solo para mostrarle el link a quien hizo el pedido). @storedAs encrypted */
  claimTokenEnc: string | null
  claimExpiresAt: Date | null
  /** Email del pedido de origen, hasheado (el reclamo exige el mismo email). */
  sourceEmailHash: string | null
  /** Intentos fallidos de código (bloqueo anti fuerza bruta). */
  failedAttempts: number
  lastStep: number | null
  redeemedAt: Date | null
  /** Id del pedido de canje del comercio (reintentos idempotentes). */
  redemptionRequestId: string | null
  redemptionLedgerId: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

const NetworkBenefitSchema = new Schema<INetworkBenefit>({
  ref: { type: String, required: true },
  consumerUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  campaignId: { type: Schema.Types.ObjectId, ref: 'NetworkCampaign', required: true },
  relationId: { type: Schema.Types.ObjectId, ref: 'NetworkRelation', required: true },
  emitterTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  receiverTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  sourceOrderId: { type: String, required: true },
  status: { type: String, enum: ['pending_claim', 'issued', 'redeemed', 'reversed', 'expired', 'revoked'], required: true },
  benefit: {
    type: new Schema({
      type: { type: String, enum: ['percent', 'fixed'], required: true },
      value: { type: Number, required: true },
      maxDiscountCents: { type: Number, default: null },
      minPurchaseCents: { type: Number, default: 0 },
    }, { _id: false }),
    required: true,
  },
  title: { type: String, required: true },
  issuedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  secretEnc: { type: String, required: true },
  claimTokenHash: { type: String, default: null },
  claimTokenEnc: { type: String, default: null },
  claimExpiresAt: { type: Date, default: null },
  sourceEmailHash: { type: String, default: null },
  failedAttempts: { type: Number, default: 0 },
  lastStep: { type: Number, default: null },
  redeemedAt: { type: Date, default: null },
  redemptionRequestId: { type: String, default: null },
  redemptionLedgerId: { type: Schema.Types.ObjectId, ref: 'NetworkLedgerEntry', default: null },
}, { timestamps: true })

NetworkBenefitSchema.index({ ref: 1 }, { unique: true })
// Un beneficio por campaña y pedido de origen (emisión idempotente).
NetworkBenefitSchema.index({ campaignId: 1, sourceOrderId: 1 }, { unique: true })
NetworkBenefitSchema.index({ consumerUserId: 1, status: 1, expiresAt: 1 })
NetworkBenefitSchema.index({ receiverTenantId: 1, status: 1 })
NetworkBenefitSchema.index({ claimTokenHash: 1 }, { sparse: true })

if (process.env.NODE_ENV !== 'production') delete (mongoose.models as Record<string, unknown>).NetworkBenefit
const NetworkBenefit = mongoose.models.NetworkBenefit || mongoose.model<INetworkBenefit>('NetworkBenefit', NetworkBenefitSchema, 'network_benefits')
export default NetworkBenefit
