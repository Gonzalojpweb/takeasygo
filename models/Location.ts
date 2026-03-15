import mongoose, { Schema, Document } from 'mongoose'

export interface ILocation extends Document {
  tenantId: mongoose.Types.ObjectId
  name: string
  slug: string
  address: string
  phone: string
  hours: string
  mapsUrl: string
  isActive: boolean
  settings: {
    acceptsOrders: boolean
    orderModes: ('takeaway' | 'dine-in')[]
    estimatedPickupTime: number
  }
  reservationConfig: {
    enabled: boolean
    minPayment: number
    timeSlots: string[]
    maxPartySize: number
  }
  hero: {
    mediaType: 'none' | 'image' | 'video'
    url: string
    showLogo: boolean
  }
  serviceHours?: {
    takeaway: Array<{ days: number[]; open: string; close: string }>
    dineIn: Array<{ days: number[]; open: string; close: string }>
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
    mapsUrl: {
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
    reservationConfig: {
      enabled: { type: Boolean, default: false },
      minPayment: { type: Number, default: 0 },
      timeSlots: { type: [String], default: [] },
      maxPartySize: { type: Number, default: 10 },
    },
    hero: {
      mediaType: { type: String, enum: ['none', 'image', 'video'], default: 'none' },
      url: { type: String, default: '' },
      showLogo: { type: Boolean, default: true },
    },
    serviceHours: {
      takeaway: { type: [{ days: [Number], open: String, close: String }], default: [] },
      dineIn: { type: [{ days: [Number], open: String, close: String }], default: [] },
    },
  },
  {
    timestamps: true,
  }
)

// El slug debe ser único dentro del mismo tenant
LocationSchema.index({ tenantId: 1, slug: 1 }, { unique: true })

// In development, always recreate to pick up schema changes across hot-reloads
if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).Location
}

const Location = mongoose.models.Location as mongoose.Model<ILocation> || mongoose.model<ILocation>('Location', LocationSchema)
export default Location
