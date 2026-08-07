import mongoose, { Schema, Document } from 'mongoose'

export type StoreItemCategory = 'food' | 'drink' | 'merch' | 'experience'
export type StoreItemTier = 'none' | 'bronze' | 'silver' | 'gold'

export interface IStoreItem extends Document {
  tenantId?: mongoose.Types.ObjectId
  locationId?: mongoose.Types.ObjectId | null  // Per-location store: null = available at all locations
  scope: 'tenant' | 'global'
  targetTenants?: mongoose.Types.ObjectId[]
  
  // Información básica
  name: string
  description: string
  imageUrl: string
  
  // Configuración de puntos
  /** Puntos requeridos para canjear. Not cents — stored as points. */
  pointsCost: number
  /** Valor en centavos del artículo (opcional, para referencia). @storedAs cents */
  cashValue?: number
  
  // Disponibilidad
  isActive: boolean
  stock?: number  // null = ilimitado
  maxPerMember?: number  // Límite de canjes por miembro
  tierRequirement?: StoreItemTier  // Nivel mínimo requerido
  
  // Validación de recurrencia (opcional)
  // Si se configura, el miembro debe haber comprado estos items
  // al menos minItemPurchases veces antes de poder canjear
  linkedMenuItemIds: mongoose.Types.ObjectId[]
  minItemPurchases: number  // 0 = sin requisito de recurrencia
  
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
      required: false,
      index: true,
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      default: null,
      index: true,
    },
    scope: {
      type: String,
      enum: ['tenant', 'global'],
      default: 'tenant',
      index: true,
    },
    targetTenants: {
      type: [Schema.Types.ObjectId],
      ref: 'Tenant',
      default: [],
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

    linkedMenuItemIds: {
      type: [Schema.Types.ObjectId],
      default: [],
      description: 'IDs de items del menú que habilitan este premio (opcional)',
    },

    minItemPurchases: {
      type: Number,
      default: 0,
      min: [0, 'El mínimo de compras no puede ser negativo'],
      description: 'Cantidad mínima de compras de linkedMenuItemIds requerida (0 = sin requisito)',
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
StoreItemSchema.index({ tenantId: 1, locationId: 1, isActive: 1, sortOrder: 1 })
StoreItemSchema.index({ tenantId: 1, locationId: 1, category: 1, isActive: 1 })
StoreItemSchema.index({ tenantId: 1, locationId: 1, isFeatured: 1, isActive: 1 })

// Middleware pre-save para validar stock
StoreItemSchema.pre('save', function () {
  if (typeof this.stock === 'number' && this.stock < 0) {
    this.stock = 0
  }
})

const StoreItem =
  mongoose.models.StoreItem ||
  mongoose.model<IStoreItem>('StoreItem', StoreItemSchema)

export default StoreItem
