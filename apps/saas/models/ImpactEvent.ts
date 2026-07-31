import mongoose, { Schema, Document } from 'mongoose'

export type ImpactEventType = 'purchase' | 'discovery' | 'visit'

export interface IImpactEvent extends Document {
  userId: mongoose.Types.ObjectId | null
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  orderId?: mongoose.Types.ObjectId
  type: ImpactEventType
  impactValue: number
  metadata: {
    orderTotal?: number
    distanceM?: number
    businessName?: string
    cuisineTypes?: string[]
    neighborhood?: string
    isFirstVisit?: boolean
  }
  createdAt: Date
}

const ImpactEventSchema = new Schema<IImpactEvent>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    type: {
      type: String,
      enum: ['purchase', 'discovery', 'visit'],
      required: true,
    },
    impactValue: {
      type: Number,
      required: true,
      min: 0,
    },
    metadata: {
      orderTotal: { type: Number },
      distanceM: { type: Number },
      businessName: { type: String },
      cuisineTypes: [{ type: String }],
      neighborhood: { type: String },
      isFirstVisit: { type: Boolean },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

ImpactEventSchema.index({ userId: 1, createdAt: -1 })
ImpactEventSchema.index({ userId: 1, tenantId: 1, type: 1 })
ImpactEventSchema.index({ userId: 1, locationId: 1 }, { unique: true, partialFilterExpression: { type: 'discovery' } })

const ImpactEvent =
  mongoose.models.ImpactEvent ||
  mongoose.model<IImpactEvent>('ImpactEvent', ImpactEventSchema)

export default ImpactEvent
