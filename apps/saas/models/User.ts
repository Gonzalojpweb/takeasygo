import mongoose, { Schema, Document } from 'mongoose'
import bcrypt from 'bcryptjs'

export type UserRole = 'superadmin' | 'admin' | 'manager' | 'staff' | 'cashier' | 'waiter' | 'host' | 'auditor' | 'consumer' | 'seller'

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
  verifyToken: string | null
  verifyTokenExpiry: Date | null
  emailVerified: Date | null
  lastLoginAt: Date | null
  /** PIN del POS (bcrypt). Nunca se selecciona por defecto. */
  pin?: string | null
  /** HMAC del PIN por tenant (lib @takeasygo/business/pos-pin). Nunca se selecciona por defecto. */
  posPinLookup?: string | null
  /** Cuándo se asignó/cambió el PIN (visible en el admin, sin exponer el PIN). */
  posPinUpdatedAt?: Date | null
  googleContacts: {
    accessToken: string | null
    refreshToken: string | null
    expiresAt: Date | null
    authorizedAt: Date | null
    connectedEmail: string | null
    isConnected: boolean
  }
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
      enum: ['superadmin', 'admin', 'manager', 'staff', 'cashier', 'waiter', 'host', 'auditor', 'consumer', 'seller'],
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
    verifyToken: {
      type: String,
      default: null,
      select: false,
    },
    verifyTokenExpiry: {
      type: Date,
      default: null,
      select: false,
    },
    emailVerified: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    // ── PIN del POS (login rápido en apps/pos vía apps/sync) ─────────────────
    // Sin default: el campo NO existe en usuarios sin PIN, así el índice
    // único parcial de abajo solo cubre a los que tienen uno.
    pin: { type: String, select: false },
    posPinLookup: { type: String, select: false },
    posPinUpdatedAt: { type: Date, default: null },
    googleContacts: {
      accessToken:  { type: String, default: null },
      refreshToken: { type: String, default: null },
      expiresAt:    { type: Date, default: null },
      authorizedAt: { type: Date, default: null },
      connectedEmail: { type: String, default: null },
      isConnected:  { type: Boolean, default: false },
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
// Login por PIN: lookup O(1) y un PIN no se repite dentro del tenant.
UserSchema.index(
  { tenantId: 1, posPinLookup: 1 },
  { unique: true, partialFilterExpression: { posPinLookup: { $type: 'string' } } }
)

// Hash bcrypt completo: $2a/$2b/$2x/$2y + costo 2 dígitos + 53 chars del
// digest (60 en total). Un string que solo "empiece" con $2 pero no cumple
// el formato NO es un hash: se trata como texto plano y se cifra.
const BCRYPT_HASH_RE = /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/

// Cifrar contraseña en texto plano al guardar (bcrypt ~$2b$). Los hashes ya
// cifrados (formato bcrypt completo) no se tocan. Solo aplica vía save(); los
// updates directos sobre el campo password deben usar save() o hashear.
UserSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return
  if (BCRYPT_HASH_RE.test(this.password)) return
  this.password = await bcrypt.hash(this.password, 10)
})

const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema)
export default User