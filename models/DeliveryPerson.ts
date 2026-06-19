import mongoose, { Schema, Document } from 'mongoose'

export interface IDeliveryPerson extends Document {
  tenantId: mongoose.Types.ObjectId
  name: string
  phone: string
  tokenHash: string
  tokenPrefix: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const DeliveryPersonSchema = new Schema<IDeliveryPerson>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    tokenHash: {
      type: String,
      required: true,
    },
    tokenPrefix: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
)

DeliveryPersonSchema.index({ tenantId: 1, isActive: 1 })

export default mongoose.models.DeliveryPerson ||
  mongoose.model<IDeliveryPerson>('DeliveryPerson', DeliveryPersonSchema)
