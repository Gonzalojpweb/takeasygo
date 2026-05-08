import mongoose, { Schema, Document } from 'mongoose'

export type StoreItemCategory = 'food' | 'drink' | 'merch' | 'experience'
export type StoreItemTier = 'none' | 'bronze' | 'silver' | 'gold'

export interface IStoreItem extends Document {
  tenantId: mongoose.Types.ObjectId
  
  // Información básica
  name: string
  description: string
  imageUrl: string
  
  // Configuración de puntos
  pointsCost: number  // Puntos requeridos para canjear
  cashValue?: number  // Valor en pesos (opcional, para referencia)
  
  // Disponibilidad
  isActive: boolean
  stock?: number  // null = ilimitado
  maxPerMember?: number  // Límite de canjes por miembro
  tierRequirement?: StoreItemTier  // Nivel mínimo requerido
  
  // Categorización
  category: StoreItemCategory
  tags: string[]
  
  // Ordenamiento
  sortOrder: number
  isFeatured: boolean
  
  // Estadísticas
  totalRedemptions: number
  
  createdAt: Date
  updatedAt: Date
}

const StoreItemSchema = new Schema<IStoreItem>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: [true, 'El nombre del item es obligatorio'],
      trim: true,
      maxlength: 100,
    },

    description: {
      type: String,
      required: [true, 'La descripción es obligatoria'],
      trim: true,
      maxlength: 500,
    },

    imageUrl: {
      type: String,
      required: [true, 'La imagen es obligatoria'],
      trim: true,
    },

    pointsCost: {
      type: Number,
      required: [true, 'El costo en puntos es obligatorio'],
      min: [1, 'El costo mínimo es 1 punto'],
    },

    cashValue: {
      type: Number,
      min: [0, 'El valor en cash no puede ser negativo'],
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    stock: {
      type: Number,
      min: [0, 'El stock no puede ser negativo'],
      default: null,
    },

    maxPerMember: {
      type: Number,
      min: [1, 'El límite por miembro debe ser al menos 1'],
      default: null,
    },

    tierRequirement: {
      type: String,
      enum: ['none', 'bronze', 'silver', 'gold'],
      default: 'none',
    },

    category: {
      type: String,
      enum: ['food', 'drink', 'merch', 'experience'],
      required: [true, 'La categoría es obligatoria'],
      index: true,
    },

    tags: {
      type: [String],
      default: [],
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },

    totalRedemptions: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
)

// Índices compuestos
StoreItemSchema.index({ tenantId: 1, isActive: 1, sortOrder: 1 })
StoreItemSchema.index({ tenantId: 1, category: 1, isActive: 1 })
StoreItemSchema.index({ tenantId: 1, isFeatured: 1, isActive: 1 })

// Middleware pre-save para validar stock
StoreItemSchema.pre('save', function () {
  if (this.stock !== null && this.stock < 0) {
    this.stock = 0
  }
})

const StoreItem =
  mongoose.models.StoreItem ||
  mongoose.model<IStoreItem>('StoreItem', StoreItemSchema)

export default StoreItem
