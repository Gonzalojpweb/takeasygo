import mongoose, { Schema, Document } from 'mongoose'
import crypto from 'crypto'

export type StoreRedemptionStatus = 'pending' | 'claimed' | 'expired' | 'cancelled'

export interface IStoreRedemption extends Document {
  tenantId: mongoose.Types.ObjectId
  memberId: mongoose.Types.ObjectId
  storeItemId: mongoose.Types.ObjectId
  
  // Información del canje
  /** Puntos usados en el canje. Not cents — stored as points. */
  pointsUsed: number
  /** Valor en centavos del artículo canjeado. @storedAs cents */
  cashValue?: number
  
  // Estado
  status: StoreRedemptionStatus
  
  // Validación
  redemptionCode: string  // Código único para validar en el local
  
  // Metadata
  locationId?: mongoose.Types.ObjectId  // Dónde se reclamó
  claimedAt?: Date
  expiresAt?: Date
  
  createdAt: Date
  updatedAt: Date
}

const StoreRedemptionSchema = new Schema<IStoreRedemption>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },

    memberId: {
      type: Schema.Types.ObjectId,
      ref: 'LoyaltyMember',
      required: true,
      index: true,
    },

    storeItemId: {
      type: Schema.Types.ObjectId,
      ref: 'StoreItem',
      required: true,
      index: true,
    },

    pointsUsed: {
      type: Number,
      required: [true, 'Los puntos usados son obligatorios'],
      min: [1, 'Mínimo 1 punto'],
    },

    cashValue: {
      type: Number,
      min: [0, 'El valor en cash no puede ser negativo'],
      default: null,
    },

    status: {
      type: String,
      enum: ['pending', 'claimed', 'expired', 'cancelled'],
      default: 'pending',
      index: true,
    },

    redemptionCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    locationId: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      default: null,
    },

    claimedAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

// Índices compuestos
StoreRedemptionSchema.index({ tenantId: 1, memberId: 1, status: 1 })
StoreRedemptionSchema.index({ tenantId: 1, redemptionCode: 1 })
StoreRedemptionSchema.index({ memberId: 1, status: 1, createdAt: -1 })
StoreRedemptionSchema.index({ expiresAt: 1, status: 1 })

// Helper para generar código de redención único
function generateRedemptionCode(): string {
  // Formato: TGO-XXXX-XXXX (ej: TGO-A3F7-K9M2)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const segment = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `TGO-${segment()}-${segment()}`
}

// Middleware pre-validate: generar redemptionCode único
StoreRedemptionSchema.pre('validate', async function () {
  if (!this.redemptionCode) {
    let code = generateRedemptionCode()
    let attempts = 0
    const maxAttempts = 10

    while (attempts < maxAttempts) {
      const exists = await (this.constructor as any).findOne({ redemptionCode: code }).lean()
      if (!exists) break
      code = generateRedemptionCode()
      attempts++
    }

    this.redemptionCode = code
  }
})

// Middleware pre-validate: calcular expiresAt si no existe
StoreRedemptionSchema.pre('validate', function () {
  if (!this.expiresAt && this.status === 'pending') {
    // Por defecto, expira en 24 horas (puede ser configurado por tenant)
    this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  }
})

const StoreRedemption =
  mongoose.models.StoreRedemption ||
  mongoose.model<IStoreRedemption>('StoreRedemption', StoreRedemptionSchema)

export default StoreRedemption
