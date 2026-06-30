import mongoose, { Schema, Document } from 'mongoose'

export interface IRating extends Document {
  orderId: mongoose.Types.ObjectId
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  stars: 1 | 2 | 3 | 4 | 5
  comment: string
  createdAt: Date
}

const RatingSchema = new Schema<IRating>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true, // un rating por pedido
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
    },
    stars: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      default: '',
      trim: true,
      maxlength: 280,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

RatingSchema.index({ tenantId: 1, createdAt: -1 })
RatingSchema.index({ tenantId: 1, locationId: 1, createdAt: -1 })

const Rating = mongoose.models.Rating || mongoose.model<IRating>('Rating', RatingSchema)
export default Rating
