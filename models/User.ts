import mongoose, { Schema, Document } from 'mongoose'

export type UserRole = 'superadmin' | 'admin' | 'manager' | 'staff' | 'cashier' | 'consumer'

export interface IUser extends Document {
  name: string
  email: string
  password?: string // Optional for OAuth users
  image?: string    // Profile picture
  role: UserRole
  tenantId: mongoose.Types.ObjectId | null
  assignedLocation: mongoose.Types.ObjectId | null
  isActive: boolean
  resetToken: string | null
  resetTokenExpiry: Date | null
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
    role: {
      type: String,
      enum: ['superadmin', 'admin', 'manager', 'staff', 'cashier', 'consumer'],
      required: true,
      default: 'consumer',
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
    },
    assignedLocation: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
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
  },
  {
    timestamps: true,
  }
)

// Índices para queries frecuentes
UserSchema.index({ email: 1 })
UserSchema.index({ tenantId: 1, role: 1 })

const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema)
export default User