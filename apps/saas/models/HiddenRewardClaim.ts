import mongoose, { Schema, Document, Types } from 'mongoose'

/**
 * Máquina de estados del HiddenRewardClaim:
 *
 * reserva → (pedido pago aprobado) → pendiente → (checkout futuro) → reservado → (pago aprobado) → consumido
 * reserva → (expiración 15min) → expired
 * pendiente → (expiración claimExpiryDays) → expired
 * reservado → (expiración 20min / pedido cancelado) → pendiente (libera para reusar)
 * consumido → estado terminal
 */
export type HiddenRewardClaimStatus = 'reserva' | 'pendiente' | 'reservado' | 'consumido' | 'expired'

export interface IHiddenRewardClaim extends Document {
  tenantId: Types.ObjectId
  menuItemId: Types.ObjectId
  /** Hash del ID de sesión del dispositivo (cookie hr_sid). Usado para unicidad por dispositivo en la fase de reserva */
  deviceId: string
  /** phoneHash del cliente — se setea al confirmar el pago del primer pedido. null mientras es reserva */
  customerPhoneHash: string | null
  /** ID de sesión del carrito donde se descubrió — para la regla "mismo carrito no puede consumir" */
  sessionId: string
  /** Porcentaje de descuento al momento del descubrimiento (snapshot) */
  discountPercentage: number
  /** Título de la recompensa al momento del descubrimiento (snapshot) */
  rewardTitle: string
  /** Descripción de la recompensa (snapshot) */
  rewardDescription: string
  status: HiddenRewardClaimStatus
  /** Cuándo se descubrió originalmente */
  discoveredAt: Date
  /** Expiración de la reserva inicial (15 min). Se setea solo en status='reserva' */
  reservationExpiresAt: Date | null
  /** Si está 'reservado': ID del pedido futuro que lo tiene adjuntado */
  reservedOrderId: Types.ObjectId | null
  /** Timestamp de cuándo se vinculó el teléfono (upgrade de identidad) */
  phoneLinkedAt: Date | null
  /** Si está 'consumido' o 'reservado': ID del pedido que lo usó/consume */
  usedOrderId: Types.ObjectId | null
  /** Timestamp de cuándo se consumió definitivamente */
  consumedAt: Date | null
  /** Vigencia del claim como 'pendiente' (claimExpiryDays del menú) */
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

const HiddenRewardClaimSchema = new Schema<IHiddenRewardClaim>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    menuItemId: {
      type: Schema.Types.ObjectId,
      ref: 'MenuItem',
      required: true,
      index: true,
    },
    /** Hash de la cookie hr_sid (session del dispositivo) */
    deviceId: {
      type: String,
      required: true,
    },
    /** phoneHash — null durante la fase 'reserva' */
    customerPhoneHash: {
      type: String,
      default: null,
    },
    /** ID de sesión del carrito donde se descubrió */
    sessionId: {
      type: String,
      required: true,
    },
    discountPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    rewardTitle: {
      type: String,
      default: '',
    },
    rewardDescription: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['reserva', 'pendiente', 'reservado', 'consumido', 'expired'],
      default: 'reserva',
      index: true,
    },
    discoveredAt: {
      type: Date,
      default: Date.now,
    },
    reservationExpiresAt: {
      type: Date,
      default: null,
    },
    reservedOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    phoneLinkedAt: {
      type: Date,
      default: null,
    },
    usedOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
)

// ── Índices de unicidad ──────────────────────────────────────────────────────

// Un mismo dispositivo no puede tener múltiples reservas activas para el mismo ítem
HiddenRewardClaimSchema.index(
  { tenantId: 1, menuItemId: 1, deviceId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'reserva' },
  }
)

// Un mismo teléfono no puede reclamar el mismo hidden reward dos veces (pendiente o reservado)
HiddenRewardClaimSchema.index(
  { tenantId: 1, menuItemId: 1, customerPhoneHash: 1 },
  {
    unique: true,
    partialFilterExpression: { customerPhoneHash: { $type: 'string' }, status: { $in: ['pendiente', 'reservado'] } },
  }
)

// ── Índices de performance ───────────────────────────────────────────────────

// Queries de admin (stats por tenant)
HiddenRewardClaimSchema.index({ tenantId: 1, status: 1, discoveredAt: -1 })

// Cron: claims expirados (reservas 15min, reservados 20min, pendientes claimExpiryDays)
HiddenRewardClaimSchema.index({ expiresAt: 1, status: 1 })
HiddenRewardClaimSchema.index({ reservationExpiresAt: 1, status: 1 })

// Checkout: buscar claims pendientes por teléfono
HiddenRewardClaimSchema.index({ tenantId: 1, customerPhoneHash: 1, status: 1, expiresAt: 1 })

// Consumo atómico:.findOneAndUpdate con filtro id+status
HiddenRewardClaimSchema.index({ _id: 1, status: 1 })

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).HiddenRewardClaim
}

const HiddenRewardClaim =
  mongoose.models.HiddenRewardClaim ||
  mongoose.model<IHiddenRewardClaim>('HiddenRewardClaim', HiddenRewardClaimSchema)

export default HiddenRewardClaim
