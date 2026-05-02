import mongoose, { Schema, Document } from 'mongoose'
import crypto from 'crypto'

export type LoyaltyMemberStatus = 'active' | 'inactive' | 'blocked'
export type LoyaltyMemberSource = 'checkout' | 'qr_scan' | 'admin' | 'manual_import'
export type LoyaltyTier = 'none' | 'bronze' | 'silver' | 'gold'

export interface ILoyaltyMember extends Document {
  tenantId:  mongoose.Types.ObjectId

  // Vinculación con User (autenticación)
  userId?: mongoose.Types.ObjectId | null  // ID del usuario autenticado (opcional)

  // Identificación del cliente
  name:      string
  phone:     string
  email:     string
  birthDate?: Date | null  // Fecha de nacimiento para notificaciones de cumpleaños
  phoneHash: string   // SHA-256(phone) — para vincular órdenes sin exponer PII

  // Estado de membresía
  status:   LoyaltyMemberStatus
  joinedAt: Date
  source:   LoyaltyMemberSource

  // Caché de actividad (actualizada post-pedido para no calcular en cada consulta)
  cache: {
    totalOrders: number
    totalSpent:  number
    lastOrderAt: Date | null
    updatedAt:   Date | null
  }

  // Preparado para Fase 2 — puntos y niveles (vacío en Fase 1)
  loyalty: {
    points: number
    tier:   LoyaltyTier
  }

  // FASE WALLET: Integración Google & Apple Wallet
  wallet: {
    /** ID único público para QR (no expone ObjectId de Mongo) */
    publicId: string
    /** Google Wallet: ID del objeto loyalty en Google API */
    googleObjectId?: string
    /** Apple Wallet: Device Library Identifier para push updates */
    appleDeviceLibraryIdentifier?: string
    /** Apple Wallet: Push token para notificaciones de actualización */
    pushToken?: string
    /** Fecha de instalación en wallets */
    installedAt?: Date | null
    /** Última sincronización de puntos */
    lastSyncAt?: Date | null
  }

  notes:     string   // nota interna del admin
  createdAt: Date
  updatedAt: Date
}

const LoyaltyMemberSchema = new Schema<ILoyaltyMember>(
  {
    tenantId: {
      type:     Schema.Types.ObjectId,
      ref:      'Tenant',
      required: true,
      index:    true,
    },

    // Vinculación con User (autenticación)
    userId: {
      type:     Schema.Types.ObjectId,
      ref:      'User',
      default:  null,
      index:    true,
    },

    name: {
      type:     String,
      required: true,
      trim:     true,
    },
    phone: {
      type:    String,
      default: '',
      trim:    true,
    },
    email: {
      type:    String,
      default: '',
      trim:    true,
      lowercase: true,
    },
    birthDate: {
      type:    Date,
      default: null,
    },
    phoneHash: {
      type:    String,
      default: '',
      index:   true,
    },

    status: {
      type:    String,
      enum:    ['active', 'inactive', 'blocked'],
      default: 'active',
    },
    joinedAt: {
      type:    Date,
      default: Date.now,
    },
    source: {
      type:    String,
      enum:    ['checkout', 'qr_scan', 'admin', 'manual_import'],
      default: 'admin',
    },

    cache: {
      totalOrders: { type: Number, default: 0 },
      totalSpent:  { type: Number, default: 0 },
      lastOrderAt: { type: Date,   default: null },
      updatedAt:   { type: Date,   default: null },
    },

    loyalty: {
      points: { type: Number, default: 0 },
      tier:   {
        type:    String,
        enum:    ['none', 'bronze', 'silver', 'gold'],
        default: 'none',
      },
    },

    // FASE WALLET: Schema para integración con billeteras
    wallet: {
      publicId: {
        type: String,
        required: false,
        unique: true,
        index: true,
      },
      googleObjectId: {
        type: String,
        default: null,
        index: true,
      },
      appleDeviceLibraryIdentifier: {
        type: String,
        default: null,
      },
      pushToken: {
        type: String,
        default: null,
      },
      installedAt: {
        type: Date,
        default: null,
      },
      lastSyncAt: {
        type: Date,
        default: null,
      },
    },

    notes: {
      type:    String,
      default: '',
      trim:    true,
    },
  },
  { timestamps: true }
)

// ── Índices compuestos ────────────────────────────────────────────────────────
// Unicidad por tenant + teléfono: un cliente no puede unirse dos veces al mismo club
LoyaltyMemberSchema.index({ tenantId: 1, phoneHash: 1 }, { unique: true, sparse: true })
LoyaltyMemberSchema.index({ tenantId: 1, email: 1 })
LoyaltyMemberSchema.index({ tenantId: 1, status: 1, joinedAt: -1 })
LoyaltyMemberSchema.index({ tenantId: 1, source: 1 })
// Índice para buscar membresía por usuario autenticado
LoyaltyMemberSchema.index({ userId: 1, tenantId: 1 }, { unique: true, sparse: true })

// ── Helper estático: generar phoneHash ───────────────────────────────────────
LoyaltyMemberSchema.statics.hashPhone = function (phone: string): string {
  // NORMALIZACIÓN ESTÁNDAR: Mantiene prefijo y todos los dígitos
  const normalized = phone.replace(/[^\d+]/g, '')
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

// ── Helper: generar publicId único para QR/Wallets ────────────────────────────
function generatePublicId(): string {
  // Formato: TGO-XXXX-XXXX-XXXX (ej: TGO-A3F7-K9M2-P8R5)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const segment = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `TGO-${segment()}-${segment()}-${segment()}`
}

// ── Middleware pre-save: generar publicId si no existe ───────────────────────
LoyaltyMemberSchema.pre('save', async function () {
  if (!this.wallet?.publicId) {
    // Generar ID único (con reintentos por si hay colisión)
    let publicId = generatePublicId()
    let attempts = 0
    const maxAttempts = 5

    while (attempts < maxAttempts) {
      const exists = await (this.constructor as any).findOne({ 'wallet.publicId': publicId }).lean()
      if (!exists) break
      publicId = generatePublicId()
      attempts++
    }

    if (!this.wallet) this.wallet = {} as any
    this.wallet.publicId = publicId
  }
})

const LoyaltyMember =
  mongoose.models.LoyaltyMember ||
  mongoose.model<ILoyaltyMember>('LoyaltyMember', LoyaltyMemberSchema)

export default LoyaltyMember
