import mongoose, { Schema, Document } from 'mongoose'

export interface ShareEventDocument extends Document {
  tenantId: mongoose.Types.ObjectId
  orderId: mongoose.Types.ObjectId
  generatedAt: Date
  templateStyle: string
}

const ShareEventSchema = new Schema<ShareEventDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    generatedAt: { type: Date, default: Date.now },
    templateStyle: { type: String, default: 'impacto' },
  },
  { timestamps: false }
)

ShareEventSchema.index({ tenantId: 1, generatedAt: -1 })

export default mongoose.models.ShareEvent || mongoose.model<ShareEventDocument>('ShareEvent', ShareEventSchema)
