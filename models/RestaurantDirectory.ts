import mongoose, { Schema, Document } from 'mongoose'

export type DirectoryStatus = 'listed' | 'claimed' | 'converted'

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
  takeawayConfirmed: boolean      // confirmado que acepta takeaway
  externalMenuUrl: string         // link a carta propia (si tienen)
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
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: undefined,
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
    takeawayConfirmed: {
      type: Boolean,
      default: true,
    },
    externalMenuUrl: {
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
