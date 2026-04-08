import mongoose, { Schema, Document } from 'mongoose'
import crypto from 'crypto'

export type LoyaltyMemberStatus = 'active' | 'inactive' | 'blocked'
export type LoyaltyMemberSource = 'checkout' | 'qr_scan' | 'admin' | 'manual_import'
export type LoyaltyTier = 'none' | 'bronze' | 'silver' | 'gold'

export interface ILoyaltyMember extends Document {
  tenantId:  mongoose.Types.ObjectId

  // Identificación del cliente
  name:      string
  phone:     string
  email:     string
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

// ── Helper estático: generar phoneHash ───────────────────────────────────────
LoyaltyMemberSchema.statics.hashPhone = function (phone: string): string {
  const normalized = phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '')
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

const LoyaltyMember =
  mongoose.models.LoyaltyMember ||
  mongoose.model<ILoyaltyMember>('LoyaltyMember', LoyaltyMemberSchema)

export default LoyaltyMember
