import mongoose, { Schema, Document } from 'mongoose'

export type UserRole = 'superadmin' | 'admin' | 'manager' | 'staff' | 'cashier' | 'consumer' | 'seller'

export interface IUser extends Document {
  name: string
  email: string
  password?: string
  image?: string
  phone?: string
  role: UserRole
  tenantId: mongoose.Types.ObjectId | null
  assignedLocations: mongoose.Types.ObjectId[]
  assignedTenants: mongoose.Types.ObjectId[]
  isActive: boolean
  savedAddresses: {
    label: string
    address: string
    city?: string
    coordinates: { lat: number; lng: number }
    isDefault?: boolean
  }[]
  resetToken: string | null
  resetTokenExpiry: Date | null
  emailVerified: Date | null
  createdAt: Date
  updatedAt: Date
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'El email es obligatorio'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: function (this: any) {
        // Required only if not a consumer (or better: only if explicitly using credentials)
        // For simplicity, we make it optional if not provided
        return false
      },
      minlength: [8, 'La contraseña debe tener al menos 8 caracteres'],
    },
    image: {
      type: String,
      default: null,
    },
    phone: {
      type: String,
      default: null,
      unique: true,
      sparse: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['superadmin', 'admin', 'manager', 'staff', 'cashier', 'consumer', 'seller'],
      required: true,
      default: 'consumer',
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
    },
    assignedLocations: {
      type: [Schema.Types.ObjectId],
      ref: 'Location',
      default: [],
    },
    assignedTenants: {
      type: [Schema.Types.ObjectId],
      ref: 'Tenant',
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    savedAddresses: [
      {
        label: { type: String, required: true }, // "Casa", "Trabajo"
        address: { type: String, required: true },
        city: { type: String },
        coordinates: {
          lat: { type: Number, required: true },
          lng: { type: Number, required: true }
        },
        isDefault: { type: Boolean, default: false }
      }
    ],
    resetToken: {
      type: String,
      default: null,
      select: false, // nunca se incluye en queries normales
    },
    resetTokenExpiry: {
      type: Date,
      default: null,
      select: false,
    },
    emailVerified: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

// Índices para queries frecuentes
UserSchema.index({ email: 1 })
UserSchema.index({ phone: 1 }, { sparse: true })
UserSchema.index({ tenantId: 1, role: 1 })

const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema)
export default User