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
  // ── Red TakeasyGO ──────────────────────────────────────────────────────────
  geo?: {
    type: 'Point'
    coordinates: [number, number] // [longitude, latitude] — GeoJSON estándar
  }
  networkVisible: boolean // true = aparece en el mapa público de consumidores
  // ──────────────────────────────────────────────────────────────────────────
  settings: {
    acceptsOrders: boolean
    orderModes: ('takeaway' | 'dine-in' | 'business' | 'delivery')[]
    estimatedPickupTime: number
    /** Anuncio de demora por modo de pedido (solo UX, no afecta ICO) */
    delayAnnouncement?: {
      takeaway?: { enabled: boolean; extraMinutes: number; message: string; updatedAt: Date | null }
      delivery?: { enabled: boolean; extraMinutes: number; message: string; updatedAt: Date | null }
      'dine-in'?: { enabled: boolean; extraMinutes: number; message: string; updatedAt: Date | null }
      business?: { enabled: boolean; extraMinutes: number; message: string; updatedAt: Date | null }
    }
    /** Historial de ajustes automáticos del tiempo estimado (anti-gaming audit) */
    adjustmentHistory?: Array<{
      previousValue: number
      newValue: number
      reason: string
      icoScore: number | null
      sampleSize: number
      triggeredBy: 'cron' | 'order_completed' | 'admin_request' | 'system_init'
      timestamp: Date
    }>
  }
  deliveryConfig?: {
    enabled: boolean
    ranges: Array<{ fromKm: number; toKm: number; price: number }>
    maxRangeKm: number
  }
  reservationConfig: {
    enabled: boolean
    minPayment: number
    timeSlots: string[]
    maxPartySize: number
    slotConfig?: {
      enabled: boolean
      operatingHours: Array<{ days: number[]; open: string; close: string }>
      slotIntervalMinutes: number
      blockDurationMinutes: number
      maxReservationsPerSlot: number
    }
  }
  hero: {
    mediaType: 'none' | 'image' | 'video'
    url: string
    showLogo: boolean
  }
  cuisineTypes: string[]
  timezone: string
  /** Índice de color para identificación visual de sede en el admin (0-7) */
  colorIndex: number
  serviceHours?: {
    takeaway: Array<{ days: number[]; open: string; close: string }>
    dineIn: Array<{ days: number[]; open: string; close: string }>
    delivery: Array<{ days: number[]; open: string; close: string }>
  }
  scheduledOrdersConfig?: {
    enabled: boolean
    maxAdvanceHours: number
    minAdvanceMinutes: number
    slotDurationMinutes: number
    maxOrdersPerSlot: number
    gracePeriodMinutes: number
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
    // ── Red TakeasyGO ────────────────────────────────────────────────────────
    geo: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: undefined,
      },
    },
    networkVisible: {
      type: Boolean,
      default: true,
    },
    // ─────────────────────────────────────────────────────────────────────────
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
          enum: ['takeaway', 'dine-in', 'business', 'delivery'] as const,
          default: ['takeaway'],
        },
        estimatedPickupTime: { type: Number, default: 20 },
        delayAnnouncement: {
          type: {
            takeaway: {
              type: {
                enabled: { type: Boolean, default: false },
                extraMinutes: { type: Number, default: 0, min: 0 },
                message: { type: String, default: '' },
                updatedAt: { type: Date, default: null },
              },
              default: { enabled: false, extraMinutes: 0, message: '', updatedAt: null },
            },
            delivery: {
              type: {
                enabled: { type: Boolean, default: false },
                extraMinutes: { type: Number, default: 0, min: 0 },
                message: { type: String, default: '' },
                updatedAt: { type: Date, default: null },
              },
              default: { enabled: false, extraMinutes: 0, message: '', updatedAt: null },
            },
            'dine-in': {
              type: {
                enabled: { type: Boolean, default: false },
                extraMinutes: { type: Number, default: 0, min: 0 },
                message: { type: String, default: '' },
                updatedAt: { type: Date, default: null },
              },
              default: { enabled: false, extraMinutes: 0, message: '', updatedAt: null },
            },
            business: {
              type: {
                enabled: { type: Boolean, default: false },
                extraMinutes: { type: Number, default: 0, min: 0 },
                message: { type: String, default: '' },
                updatedAt: { type: Date, default: null },
              },
              default: { enabled: false, extraMinutes: 0, message: '', updatedAt: null },
            },
          },
          default: {},
        },
        adjustmentHistory: {
          type: [{
            previousValue: { type: Number, required: true },
            newValue: { type: Number, required: true },
            reason: { type: String, required: true },
            icoScore: { type: Number, default: null },
            sampleSize: { type: Number, required: true },
            triggeredBy: {
              type: String,
              enum: ['cron', 'order_completed', 'admin_request', 'system_init'],
              required: true
            },
            timestamp: { type: Date, default: Date.now }
          }],
          default: []
        }
    },
    reservationConfig: {
      enabled: { type: Boolean, default: false },
      minPayment: { type: Number, default: 0 },
      timeSlots: { type: [String], default: [] },
      maxPartySize: { type: Number, default: 10 },
      slotConfig: {
        enabled: { type: Boolean, default: false },
        operatingHours: { type: [{ days: [Number], open: String, close: String }], default: [] },
        slotIntervalMinutes: { type: Number, default: 30 },
        blockDurationMinutes: { type: Number, default: 90 },
        maxReservationsPerSlot: { type: Number, default: 1 },
      },
    },
    hero: {
      mediaType: { type: String, enum: ['none', 'image', 'video'], default: 'none' },
      url: { type: String, default: '' },
      showLogo: { type: Boolean, default: true },
    },
    cuisineTypes: { type: [String], default: [] },
    timezone: { type: String, required: true, default: 'America/Argentina/Buenos_Aires' },
    colorIndex: { type: Number, default: 0, min: 0, max: 7 },
    serviceHours: {
      takeaway: { type: [{ days: [Number], open: String, close: String }], default: [] },
      dineIn: { type: [{ days: [Number], open: String, close: String }], default: [] },
      delivery: { type: [{ days: [Number], open: String, close: String }], default: [] },
    },
    scheduledOrdersConfig: {
      enabled: { type: Boolean, default: false },
      maxAdvanceHours: { type: Number, default: 24 },
      minAdvanceMinutes: { type: Number, default: 30 },
      slotDurationMinutes: { type: Number, default: 15 },
      maxOrdersPerSlot: { type: Number, default: 10 },
      gracePeriodMinutes: { type: Number, default: 15 },
    },
    deliveryConfig: {
      type: {
        enabled: { type: Boolean, default: false },
        ranges: {
          type: [{
            fromKm: { type: Number, required: true, min: 0 },
            toKm:   { type: Number, required: true, min: 0 },
            price:  { type: Number, required: true, min: 0 },
          }],
          default: [],
        },
        maxRangeKm: { type: Number, default: 0 },
      },
      default: { enabled: false, ranges: [], maxRangeKm: 0 },
    },
  },
  {
    timestamps: true,
  }
)

// El slug debe ser único dentro del mismo tenant
LocationSchema.index({ tenantId: 1, slug: 1 }, { unique: true })

// Índice geoespacial para consultas de proximidad (sparse: solo indexa docs con geo)
LocationSchema.index({ geo: '2dsphere' }, { sparse: true })

// In development, always recreate to pick up schema changes across hot-reloads
if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).Location
}

const Location = mongoose.models.Location as mongoose.Model<ILocation> || mongoose.model<ILocation>('Location', LocationSchema)
export default Location
