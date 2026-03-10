import mongoose, { Schema, Document } from 'mongoose'

export interface ILocation extends Document {
  tenantId: mongoose.Types.ObjectId
  name: string
  slug: string
  address: string
  phone: string
  hours: string
  isActive: boolean
  settings: {
    acceptsOrders: boolean
    orderModes: ('takeaway' | 'dine-in')[]
    estimatedPickupTime: number
  }
  hero: {
    mediaType: 'none' | 'image' | 'video'
    url: string
    showLogo: boolean
  }
  createdAt: Date
  updatedAt: Date
}

const LocationSchema = new Schema<ILocation>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'El slug es obligatorio'],
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'El slug solo puede contener letras minúsculas, números y guiones'],
    },
    address: {
      type: String,
      required: [true, 'La dirección es obligatoria'],
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    hours: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    settings: {
      acceptsOrders: { type: Boolean, default: true },
      orderModes: {
        type: [String],
        enum: ['takeaway', 'dine-in'],
        default: ['takeaway'],
      },
      estimatedPickupTime: { type: Number, default: 20 },
    },
    hero: {
      mediaType: { type: String, enum: ['none', 'image', 'video'], default: 'none' },
      url: { type: String, default: '' },
      showLogo: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  }
)

// El slug debe ser único dentro del mismo tenant
LocationSchema.index({ tenantId: 1, slug: 1 }, { unique: true })

const Location = mongoose.models.Location || mongoose.model<ILocation>('Location', LocationSchema)
export default Location
