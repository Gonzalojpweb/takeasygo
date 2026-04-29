import mongoose, { Schema, Document } from 'mongoose'

export interface IQrPromoView extends Document {
  tenantId: mongoose.Types.ObjectId
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
    timestamps: false, // Usamos viewedAt directamente
  }
)

// Índice compuesto para buscar rápido por tenant + ip
QrPromoViewSchema.index({ tenantId: 1, ip: 1, viewedAt: -1 })

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).QrPromoView
}

const QrPromoView = mongoose.models.QrPromoView || mongoose.model<IQrPromoView>('QrPromoView', QrPromoViewSchema)
export default QrPromoView
