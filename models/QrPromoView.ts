import mongoose, { Schema, Document } from 'mongoose'

export interface IQrPromoView extends Document {
  tenantId: mongoose.Types.ObjectId
  promoId?: mongoose.Types.ObjectId
  promoSlug?: string
  scope?: 'tenant' | 'global'
  ip: string
  userAgent?: string
  source: string
  viewedAt: Date
  discountPercentage: number
}

const QrPromoViewSchema = new Schema<IQrPromoView>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    promoId: {
      type: Schema.Types.ObjectId,
      ref: 'QrPromo',
      default: null,
    },
    promoSlug: {
      type: String,
      default: '',
    },
    scope: {
      type: String,
      enum: ['tenant', 'global'],
      default: 'tenant',
    },
    ip: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      default: '',
    },
    source: {
      type: String,
      default: '',
    },
    viewedAt: {
      type: Date,
      default: Date.now,
    },
    discountPercentage: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: false,
  }
)

QrPromoViewSchema.index({ tenantId: 1, promoSlug: 1, ip: 1, viewedAt: -1 })
QrPromoViewSchema.index({ tenantId: 1, source: 1 })

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).QrPromoView
}

const QrPromoView = mongoose.models.QrPromoView || mongoose.model<IQrPromoView>('QrPromoView', QrPromoViewSchema)
export default QrPromoView
