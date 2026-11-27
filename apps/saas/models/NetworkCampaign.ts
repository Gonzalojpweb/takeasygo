import mongoose, { Schema, Types } from 'mongoose'

// ============================================================================
// NetworkCampaign — beneficio que ofrece un comercio receptor (§3, etapa 3)
// ============================================================================
// El receptor ofrece el beneficio (lo paga él: es su descuento); los emisores
// habilitados lo distribuyen entre sus clientes. En la etapa 3 la registra el
// superadmin; la emisión y el canje llegan en las etapas 4–5.
//   · allowedEmitterTenantIds vacío = todos los emisores con relación activa
//     hacia este receptor. Con ids = solo esos (y deben tener relación activa).
// Importes en centavos.
// ============================================================================

export interface INetworkCampaign {
  _id: Types.ObjectId
  receiverTenantId: Types.ObjectId
  title: string
  description: string
  benefit: {
    type: 'percent' | 'fixed'
    /** % (1–100) o importe fijo en centavos. */
    value: number
    /** Tope del descuento en centavos (solo para %; null = sin tope). @storedAs cents */
    maxDiscountCents: number | null
  }
  /** Compra mínima en el receptor para usarlo, en centavos. @storedAs cents */
  minPurchaseCents: number
  validFrom: Date
  validTo: Date | null
  /** Canjes totales permitidos (null = sin límite). */
  maxRedemptions: number | null
  /** Canjes por consumidor. */
  perConsumerLimit: number
  /** Días que vale un beneficio desde que se emite. */
  benefitValidityDays: number
  allowedEmitterTenantIds: Types.ObjectId[]
  status: 'draft' | 'active' | 'paused' | 'ended'
  /**
   * Etapa 4 — piloto con grupo de control. Lo configura el superadmin:
   * controlPercent = % de consumidores que NO recibe el beneficio (control);
   * qrPromoId = promo existente del receptor que hace de beneficio (se reusa
   * QrPromo); windowDays = días que se mide la compra en el receptor.
   */
  pilot: { enabled: boolean; controlPercent: number; qrPromoId: Types.ObjectId | null; windowDays: number } | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

const NetworkCampaignSchema = new Schema<INetworkCampaign>({
  receiverTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: '', trim: true, maxlength: 1000 },
  benefit: {
    type: new Schema({
      type: { type: String, enum: ['percent', 'fixed'], required: true },
      value: { type: Number, required: true, min: 0 },
      maxDiscountCents: { type: Number, default: null, min: 0 },
    }, { _id: false }),
    required: true,
  },
  minPurchaseCents: { type: Number, default: 0, min: 0 },
  validFrom: { type: Date, required: true },
  validTo: { type: Date, default: null },
  maxRedemptions: { type: Number, default: null, min: 1 },
  perConsumerLimit: { type: Number, default: 1, min: 1 },
  benefitValidityDays: { type: Number, default: 30, min: 1, max: 365 },
  allowedEmitterTenantIds: { type: [Schema.Types.ObjectId], ref: 'Tenant', default: [] },
  status: { type: String, enum: ['draft', 'active', 'paused', 'ended'], default: 'draft' },
  pilot: {
    type: new Schema({
      enabled: { type: Boolean, default: false },
      controlPercent: { type: Number, default: 20, min: 0, max: 90 },
      qrPromoId: { type: Schema.Types.ObjectId, ref: 'QrPromo', default: null },
      windowDays: { type: Number, default: 30, min: 1, max: 180 },
    }, { _id: false }),
    default: null,
  },
  createdBy: { type: String, required: true },
}, { timestamps: true })

NetworkCampaignSchema.index({ receiverTenantId: 1, status: 1 })
NetworkCampaignSchema.index({ 'pilot.enabled': 1, status: 1 })

if (process.env.NODE_ENV !== 'production') delete (mongoose.models as Record<string, unknown>).NetworkCampaign
const NetworkCampaign = mongoose.models.NetworkCampaign || mongoose.model<INetworkCampaign>('NetworkCampaign', NetworkCampaignSchema, 'network_campaigns')
export default NetworkCampaign
