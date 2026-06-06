import mongoose, { Schema, Document } from 'mongoose'

export interface IQrPromo extends Document {
  tenantId: mongoose.Types.ObjectId
  slug: string
  isEnabled: boolean
  type: 'discount' | 'info' | 'loyalty'
  discountPercentage: number
  frequency: 'once' | 'every_visit' | 'daily'
  title: string
  subtitle: string
  buttonText: string
  termsText: string
  imageUrl: string
  badgeLabel: string
  offLabel: string
  takeawayWarningTitle: string
  takeawayWarningText: string
  loadingText: string
  checkoutDiscountLabel: string
  sourceTriggers: string[]
  createdAt: Date
  updatedAt: Date
}

const QrPromoSchema = new Schema<IQrPromo>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
    },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    isEnabled: { type: Boolean, default: false },
    type: { type: String, enum: ['discount', 'info', 'loyalty'], default: 'discount' },
    discountPercentage: { type: Number, default: 15, min: 0, max: 100 },
    frequency: { type: String, enum: ['once', 'every_visit', 'daily'], default: 'once' },
    title: { type: String, default: '¡Primera vez por QR!' },
    subtitle: { type: String, default: 'Obtené {discount}% OFF en tu primer pedido takeaway' },
    buttonText: { type: String, default: 'Ver menú' },
    termsText: { type: String, default: 'Válido solo para pedidos takeaway. No acumulable con otras promociones.' },
    imageUrl: { type: String, default: '' },
    badgeLabel: { type: String, default: 'SOLO POR HOY' },
    offLabel: { type: String, default: 'OFF' },
    takeawayWarningTitle: { type: String, default: 'DESCUENTO EXCLUSIVO PARA TAKEAWAY' },
    takeawayWarningText: { type: String, default: 'No aplicable para consumir en el local' },
    loadingText: { type: String, default: 'Procesando...' },
    checkoutDiscountLabel: { type: String, default: 'Descuento QR' },
    sourceTriggers: { type: [String], default: ['qr'] },
  },
  {
    timestamps: true,
  }
)

QrPromoSchema.index({ tenantId: 1, slug: 1 }, { unique: true })
QrPromoSchema.index({ tenantId: 1, isEnabled: 1 })
QrPromoSchema.index({ tenantId: 1, sourceTriggers: 1 })

const QrPromo = mongoose.models.QrPromo || mongoose.model<IQrPromo>('QrPromo', QrPromoSchema)
export default QrPromo
