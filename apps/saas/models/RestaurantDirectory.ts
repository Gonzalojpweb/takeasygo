import mongoose, { Schema, Document } from 'mongoose'

export type DirectoryStatus = 'listed' | 'claimed' | 'converted'

export type ServiceSlot = { days: number[]; open: string; close: string }

export interface IRestaurantDirectory extends Document {
  name: string
  address: string
  geo?: {
    type: 'Point'
    coordinates: [number, number] // [longitude, latitude]
  }
  phone: string
  cuisineTypes: string[]          // ["pizza", "sushi", "hamburgesas", ...]
  openingHours: string            // texto libre para MVP: "Lun-Vie 12-23hs"
  serviceHours: ServiceSlot[]     // horarios estructurados (takeaway)
  takeawayConfirmed: boolean      // confirmado que acepta takeaway
  externalMenuUrl: string         // link a carta propia (si tienen)
  logoUrl: string                 // logo del comercio
  heroImageUrl: string            // imagen de portada
  description: string             // descripción breve del comercio
  website: string                 // sitio web oficial
  instagram: string               // usuario de Instagram
  facebook: string                // URL de Facebook
  status: DirectoryStatus         // listed → claimed → converted
  addedBy: 'superadmin' | 'self_reported'
  convertedToTenantId: mongoose.Types.ObjectId | null  // si se hicieron tenant
  notes: string                   // notas internas del superadmin
  createdAt: Date
  updatedAt: Date
}

const RestaurantDirectorySchema = new Schema<IRestaurantDirectory>(
  {
    name: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true,
    },
    address: {
      type: String,
      required: [true, 'La dirección es obligatoria'],
      trim: true,
    },
    geo: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: {
        type: [Number],
      },
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    cuisineTypes: {
      type: [String],
      default: [],
    },
    openingHours: {
      type: String,
      trim: true,
      default: '',
    },
    serviceHours: {
      type: [{
        days: { type: [Number], default: [] },
        open: { type: String, default: '' },
        close: { type: String, default: '' },
      }],
      default: [],
    },
    takeawayConfirmed: {
      type: Boolean,
      default: true,
    },
    externalMenuUrl: {
      type: String,
      trim: true,
      default: '',
    },
    logoUrl: {
      type: String,
      trim: true,
      default: '',
    },
    heroImageUrl: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    website: {
      type: String,
      trim: true,
      default: '',
    },
    instagram: {
      type: String,
      trim: true,
      default: '',
    },
    facebook: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['listed', 'claimed', 'converted'],
      default: 'listed',
    },
    addedBy: {
      type: String,
      enum: ['superadmin', 'self_reported'],
      default: 'superadmin',
    },
    convertedToTenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
)

// Índice geoespacial sparse para el mapa público
RestaurantDirectorySchema.index({ geo: '2dsphere' }, { sparse: true })
// Búsqueda por nombre y estado
RestaurantDirectorySchema.index({ status: 1, createdAt: -1 })
RestaurantDirectorySchema.index({ name: 'text', address: 'text' })

const RestaurantDirectory =
  mongoose.models.RestaurantDirectory as mongoose.Model<IRestaurantDirectory> ||
  mongoose.model<IRestaurantDirectory>('RestaurantDirectory', RestaurantDirectorySchema)

export default RestaurantDirectory
