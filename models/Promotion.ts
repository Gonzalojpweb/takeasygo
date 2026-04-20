import mongoose, { Schema, Document } from 'mongoose'

export interface IPromotion {
  tenantId: mongoose.Types.ObjectId
  locationId?: mongoose.Types.ObjectId
  title: string
  description: string
  shortDescription?: string
  imageUrl?: string
  price: number
  originalPrice?: number
  currency: string
  conditions?: string
  details?: string
  visibility: 'both' | 'takeaway' | 'dine-in'
  isActive: boolean
  isFeatured: boolean
  scheduledStart?: Date
  scheduledEnd?: Date
  customStyles?: {
    backgroundColor?: string
    textColor?: string
    accentColor?: string
    badgeColor?: string
    borderRadius?: string
    cardStyle?: 'modern' | 'classic' | 'minimal'
  }
  maxRedemptions?: number
  redemptionsCount: number
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

const PromotionSchema = new Schema<IPromotion>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    shortDescription: {
      type: String,
      default: '',
      trim: true,
    },
    imageUrl: {
      type: String,
      default: '',
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    originalPrice: {
      type: Number,
      default: null,
      min: 0,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    conditions: {
      type: String,
      default: '',
    },
    details: {
      type: String,
      default: '',
    },
    visibility: {
      type: String,
      enum: ['both', 'takeaway', 'dine-in'],
      default: 'both',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    scheduledStart: {
      type: Date,
      default: null,
    },
    scheduledEnd: {
      type: Date,
      default: null,
    },
    customStyles: {
      backgroundColor: { type: String, default: '' },
      textColor: { type: String, default: '' },
      accentColor: { type: String, default: '' },
      badgeColor: { type: String, default: '' },
      borderRadius: { type: String, default: '' },
      cardStyle: { type: String, enum: ['modern', 'classic', 'minimal'], default: 'modern' },
    },
    maxRedemptions: {
      type: Number,
      default: null,
    },
    redemptionsCount: {
      type: Number,
      default: 0,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
)

PromotionSchema.index({ tenantId: 1, isActive: 1 })
PromotionSchema.index({ tenantId: 1, locationId: 1, visibility: 1 })

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).Promotion
}

const Promotion = mongoose.models.Promotion || mongoose.model<IPromotion>('Promotion', PromotionSchema)
export default Promotion