import mongoose, { Schema, Document } from 'mongoose'

export type ClubDiscountScope = 'all' | 'category' | 'subcategory' | 'item'

export interface IClubDiscount extends Document {
  tenantId: mongoose.Types.ObjectId
  scope: ClubDiscountScope
  categoryIds: mongoose.Types.ObjectId[]
  subcategoryIds: mongoose.Types.ObjectId[]
  itemIds: mongoose.Types.ObjectId[]
  /** Porcentaje de descuento 0-100. @storedAs percent */
  discountPercent: number
  /** Horas de cooldown después del registro antes de poder usar el descuento */
  cooldownHours: number
  /** Tope global de usos (0 = ilimitado) */
  maxRedemptions: number
  /** Tope por miembro: cuántas veces CADA miembro puede usar el descuento (0 = ilimitado) */
  maxUsesPerConsumer: number
  /** Usos acumulados (se incrementa atómicamente) */
  usedCount: number
  /** Habilitado/deshabilitado */
  active: boolean
  createdBy?: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const ClubDiscountSchema = new Schema<IClubDiscount>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
    },
    scope: {
      type: String,
      enum: ['all', 'category', 'subcategory', 'item'],
      default: 'all',
      required: true,
    },
    categoryIds: {
      type: [Schema.Types.ObjectId],
      default: [],
    },
    subcategoryIds: {
      type: [Schema.Types.ObjectId],
      default: [],
    },
    itemIds: {
      type: [Schema.Types.ObjectId],
      default: [],
    },
    discountPercent: {
      type: Number,
      required: true,
      min: [1, 'El descuento debe ser al menos 1%'],
      max: [100, 'El descuento no puede superar 100%'],
    },
    cooldownHours: {
      type: Number,
      default: 24,
      min: [0, 'El cooldown no puede ser negativo'],
    },
    maxRedemptions: {
      type: Number,
      default: 0,
      min: [0, 'El tope no puede ser negativo'],
    },
    maxUsesPerConsumer: {
      type: Number,
      default: 0,
      min: [0, 'El tope por miembro no puede ser negativo'],
    },
    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    active: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
)

// Índice único parcial: un solo ClubDiscount activo por tenant
ClubDiscountSchema.index(
  { tenantId: 1 },
  { unique: true, partialFilterExpression: { active: true } }
)

// Índices de 查询
ClubDiscountSchema.index({ tenantId: 1, active: 1 })

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).ClubDiscount
}

const ClubDiscount =
  mongoose.models.ClubDiscount ||
  mongoose.model<IClubDiscount>('ClubDiscount', ClubDiscountSchema)

export default ClubDiscount
