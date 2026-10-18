import mongoose, { Schema, Document } from 'mongoose'
import crypto from 'crypto'

export type StoreRedemptionStatus = 'pending' | 'claimed' | 'expired' | 'cancelled'

/**
 * De dónde sale el canje:
 * - 'standalone': el miembro canjea desde la billetera/tienda. Se descuentan
 *   puntos al crear, expira en `redemptionExpiryHours` y se reclama con código.
 * - 'checkout': el premio viaja con el pedido (línea $0 en `Order.items`).
 *   Los puntos se descuentan al aprobar el pago y el canje NO expira: se cierra
 *   al entregar el pedido. Si el pedido se cancela, se revierte junto con él.
 */
export type StoreRedemptionSource = 'checkout' | 'standalone'

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

  // Origen y vínculo con el pedido (canje checkout)
  source: StoreRedemptionSource
  /** Pedido del que forma parte el premio. null = canje standalone. */
  orderId?: mongoose.Types.ObjectId | null

  // Metadata
  locationId?: mongoose.Types.ObjectId  // Dónde se reclamó (o sede del pedido)
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

    source: {
      type: String,
      enum: ['checkout', 'standalone'],
      default: 'standalone',
      index: true,
    },

    /** Pedido del que forma parte el premio (solo source: 'checkout'). */
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
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
// Canjes que viajan con un pedido: lookup por orden y conteo por fuente
StoreRedemptionSchema.index({ tenantId: 1, orderId: 1, status: 1 })
StoreRedemptionSchema.index({ tenantId: 1, source: 1, status: 1 })

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
  // El canje que viaja con el pedido NO vence: vive mientras el pedido esté
  // pendiente y se cierra al entregarlo. Ponerle un plazo fijo generaba
  // canjes "vencidos" con puntos ya descontados cuando el pago tardaba.
  if (this.source === 'checkout') {
    this.expiresAt = null
    return
  }
  if (!this.expiresAt && this.status === 'pending') {
    // Por defecto, expira en 24 horas (puede ser configurado por tenant)
    this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  }
})

const StoreRedemption =
  mongoose.models.StoreRedemption ||
  mongoose.model<IStoreRedemption>('StoreRedemption', StoreRedemptionSchema)

export default StoreRedemption
