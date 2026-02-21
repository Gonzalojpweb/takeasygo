import mongoose, { Schema, Document } from 'mongoose'

export type UserRole = 'superadmin' | 'admin' | 'manager' | 'staff' | 'cashier'

export interface IUser extends Document {
  name: string
  email: string
  password: string
  role: UserRole
  tenantId: mongoose.Types.ObjectId | null
  assignedLocation: mongoose.Types.ObjectId | null
  isActive: boolean
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
      required: [true, 'La contraseña es obligatoria'],
      minlength: [8, 'La contraseña debe tener al menos 8 caracteres'],
    },
    role: {
      type: String,
      enum: ['superadmin', 'admin', 'manager', 'staff', 'cashier'],
      required: true,
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