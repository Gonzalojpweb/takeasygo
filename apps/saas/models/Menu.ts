import mongoose, { Schema, Document } from 'mongoose'

export interface ICustomizationOption {
  _id?: mongoose.Types.ObjectId
  name: string
  /** Precio extra de esta opción en centavos. @storedAs cents */
  extraPrice: number
  imageUrl?: string
  subGroups?: ICustomizationGroup[]  // Grupos que se activan si esta opción es elegida
}

export interface ICustomizationGroup {
  _id?: mongoose.Types.ObjectId
  name: string
  type: 'single' | 'multiple'
  required: boolean
  options: ICustomizationOption[]
  /** Regla de cálculo de precio para las opciones seleccionadas de este grupo.
   *  'sum' (default) — se suman los extraPrice de todas las opciones seleccionadas.
   *  'max' — se cobra solo el mayor extraPrice entre las opciones seleccionadas.
   *  'average' — se promedian los extraPrice.
   *  Aplica solo a las opciones directas del grupo, no recursivamente a subGroups. */
  priceRule?: 'sum' | 'max' | 'average'
}

export interface IMenuItemVariant {
  _id?: mongoose.Types.ObjectId
  name: string
  nameTranslations?: { en: string }
  /** Precio de la variante en centavos. @storedAs cents */
  price: number
  /** Precio takeaway de la variante en centavos. @storedAs cents */
  takeawayPrice?: number
  /** Precio business de la variante en centavos. @storedAs cents */
  businessPrice?: number
  /** Precio original antes de descuentos en centavos. @storedAs cents */
  originalPrice?: number
  /** Precio takeaway original antes de descuentos en centavos. @storedAs cents */
  takeawayOriginalPrice?: number
  /** Grupos de customización propios de esta variante.
   *  Cuando el usuario selecciona esta variante, estos grupos se activan
   *  además de los grupos heredados de categoría/item. */
  customizationGroups?: ICustomizationGroup[]
}

export interface IAvailabilitySlot {
  days: number[]
  timeStart: string
  timeEnd: string
}

export interface IMenuItem {
  _id?: mongoose.Types.ObjectId
  name: string
  description: string
  /** Precio base del ítem en centavos. @storedAs cents */
  price: number
  /** Precio takeaway del ítem en centavos. @storedAs cents */
  takeawayPrice?: number
  /** Precio business del ítem en centavos. @storedAs cents */
  businessPrice?: number | null
  /** Precio original de lista (antes de descuentos de categoría) en centavos. @storedAs cents */
  originalPrice?: number
  /** Precio takeaway original de lista (antes de descuentos de categoría) en centavos. @storedAs cents */
  takeawayOriginalPrice?: number
  likesCount: number
  imageUrl: string
  isAvailable: boolean
  isTakeawayAvailable: boolean
  isBusinessAvailable: boolean
  tags: string[]
  isFeatured: boolean
  suggestWith?: string[]  // IDs de ítems a sugerir cuando este se agrega al carrito
  /** Variantes del producto. Si existe y tiene elementos, el precio lo define la variante seleccionada (el price base se ignora). */
  variants?: IMenuItemVariant[]
  customizationGroups: ICustomizationGroup[]
  nameTranslations?: { en: string }
  descriptionTranslations?: { en: string }
  availabilityMode?: 'always' | 'scheduled'
  availabilitySchedule?: IAvailabilitySlot[]
  /** Hidden Reward: recompensa escondida que se revela al agregar este ítem al carrito */
  hiddenReward?: {
    enabled: boolean
    /** Porcentaje de descuento (0-100). Solo aplica a este ítem en la próxima compra */
    discountPercentage: number
    /** Título que se muestra al descubrir la recompensa */
    title: string
    /** Descripción de la recompensa */
    description: string
    /** Cantidad máxima total de claims (0 = ilimitado) */
    maxClaims: number
    /** Claims restantes (se decrementa atómicamente) */
    remainingClaims: number
    /** Inicio de vigencia (null = sin inicio) */
    scheduledStart?: Date | null
    /** Fin de vigencia (null = sin fin) */
    scheduledEnd?: Date | null
    /** Días de validez del claim después del descubrimiento (default: 30) */
    claimExpiryDays: number
  }
}

export interface IMenuSubCategory {
  _id?: mongoose.Types.ObjectId
  name: string
  description?: string
  imageUrl?: string
  sortOrder: number
  items: IMenuItem[]
  printRole?: 'kitchen' | 'bar' | 'both'
  customizationGroups?: ICustomizationGroup[]
  availabilityMode?: 'always' | 'scheduled'
  availabilitySchedule?: IAvailabilitySlot[]
}

export interface IMenuCategory {
  _id?: mongoose.Types.ObjectId
  name: string
  description: string
  imageUrl: string
  isAvailable: boolean
  isBusinessAvailable: boolean
  sortOrder: number
  items: IMenuItem[]  // items directos (cuando no hay subcategorías)
  subcategories?: IMenuSubCategory[]  // subcategorías opcionales
  printRole?: 'kitchen' | 'bar' | 'both'
  customizationGroups?: ICustomizationGroup[]   // grupos heredados por todos los items de la categoría
  nameTranslations?: { en: string }
  descriptionTranslations?: { en: string }
  availabilityMode?: 'always' | 'scheduled'
  availabilitySchedule?: IAvailabilitySlot[]
}

export interface IMenu extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  categories: IMenuCategory[]
  optionImageRegistry?: Record<string, string>  // nombre de opción → imageUrl global
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// Declarados como Schema genérico primero para permitir referencia circular opción ↔ grupo
const CustomizationOptionSchema: Schema = new Schema({})
const CustomizationGroupSchema: Schema = new Schema({})

const MenuItemVariantSchema = new Schema<IMenuItemVariant>({
  name: { type: String, required: true, trim: true },
  nameTranslations: {
    en: { type: String, default: '' },
  },
  /** @storedAs cents */
  price: { type: Number, required: true, min: 0 },
  /** @storedAs cents */
  takeawayPrice: { type: Number, min: 0 },
  /** @storedAs cents */
  businessPrice: { type: Number, min: 0 },
  /** @storedAs cents */
  originalPrice: { type: Number, min: 0 },
  /** @storedAs cents */
  takeawayOriginalPrice: { type: Number, min: 0 },
  customizationGroups: { type: [CustomizationGroupSchema], default: [] },
}, { _id: true })

// Se agregan los campos después de que ambos schemas existen (resuelve la referencia circular opción ↔ grupo)
CustomizationOptionSchema.add({
  name:       { type: String, required: true, trim: true },
  /** @storedAs cents */
  extraPrice: { type: Number, default: 0, min: 0 },
  imageUrl:   { type: String, default: '' },
  subGroups:  { type: [CustomizationGroupSchema], default: [] },
})

CustomizationGroupSchema.add({
  name:     { type: String, required: true, trim: true },
  type:     { type: String, enum: ['single', 'multiple'], default: 'single' },
  required: { type: Boolean, default: false },
  options:  { type: [CustomizationOptionSchema], default: [] },
  priceRule: { type: String, enum: ['sum', 'max', 'average'], default: 'sum' },
})

const MenuItemSchema = new Schema<IMenuItem>({
  name: {
    type: String,
    required: [true, 'El nombre del item es obligatorio'],
    trim: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },
  /** @storedAs cents */
  price: {
    type: Number,
    required: [true, 'El precio es obligatorio'],
    min: [0, 'El precio no puede ser negativo'],
  },
  /** @storedAs cents */
  takeawayPrice: {
    type: Number,
    min: [0, 'El precio para llevar no puede ser negativo'],
  },
  /** @storedAs cents */
  businessPrice: {
    type: Number,
    min: [0, 'El precio business no puede ser negativo'],
    default: null,
  },
  /** @storedAs cents */
  originalPrice: {
    type: Number,
    min: [0, 'El precio original no puede ser negativo'],
  },
  /** @storedAs cents */
  takeawayOriginalPrice: {
    type: Number,
    min: [0, 'El precio takeaway original no puede ser negativo'],
  },
  likesCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  imageUrl: {
    type: String,
    default: '',
  },
  isAvailable: {
    type: Boolean,
    default: true,
  },
  isTakeawayAvailable: {
    type: Boolean,
    default: true,
  },
  isBusinessAvailable: {
    type: Boolean,
    default: false,
  },
  tags: {
    type: [String],
    default: [],
  },
  isFeatured: {
    type: Boolean,
    default: false,
  },
  suggestWith: {
    type: [String],
    default: [],
  },
  variants: {
    type: [MenuItemVariantSchema],
    default: [],
  },
  customizationGroups: {
    type: [CustomizationGroupSchema],
    default: [],
  },
  nameTranslations: {
    en: { type: String, default: '' },
  },
  descriptionTranslations: {
    en: { type: String, default: '' },
  },
  availabilityMode: { type: String, enum: ['always', 'scheduled'], default: 'always' },
  availabilitySchedule: {
    type: [{
      days: [Number],
      timeStart: String,
      timeEnd: String,
    }],
    default: [],
  },
  hiddenReward: {
    type: {
      enabled: { type: Boolean, default: false },
      discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
      title: { type: String, default: '' },
      description: { type: String, default: '' },
      maxClaims: { type: Number, default: 0, min: 0 },
      remainingClaims: { type: Number, default: 0, min: 0 },
      scheduledStart: { type: Date, default: null },
      scheduledEnd: { type: Date, default: null },
      claimExpiryDays: { type: Number, default: 30, min: 1 },
    },
    default: null,
  },
})

const MenuSubCategorySchema = new Schema<IMenuSubCategory>({
  name: {
    type: String,
    required: [true, 'El nombre de la subcategoría es obligatorio'],
    trim: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },
  imageUrl: {
    type: String,
    default: '',
  },
  sortOrder: {
    type: Number,
    default: 0,
  },
  items: [MenuItemSchema],
  printRole: {
    type: String,
    enum: ['kitchen', 'bar', 'both'],
  },
  customizationGroups: { type: [CustomizationGroupSchema], default: [] },
  availabilityMode: { type: String, enum: ['always', 'scheduled'] },
  availabilitySchedule: {
    type: [{
      days: [Number],
      timeStart: String,
      timeEnd: String,
    }],
    default: [],
  },
})

const MenuCategorySchema = new Schema<IMenuCategory>({
  name: {
    type: String,
    required: [true, 'El nombre de la categoría es obligatorio'],
    trim: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },
  imageUrl: {
    type: String,
    default: '',
  },
  isAvailable: {
    type: Boolean,
    default: true,
  },
  isBusinessAvailable: {
    type: Boolean,
    default: false,
  },
  sortOrder: {
    type: Number,
    default: 0,
  },
  items: [MenuItemSchema],
  subcategories: { type: [MenuSubCategorySchema], default: undefined },
  printRole: {
    type: String,
    enum: ['kitchen', 'bar', 'both'],
    default: 'kitchen',
  },
  customizationGroups: { type: [CustomizationGroupSchema], default: [] },
  nameTranslations: {
    en: { type: String, default: '' },
  },
  descriptionTranslations: {
    en: { type: String, default: '' },
  },
  availabilityMode: { type: String, enum: ['always', 'scheduled'], default: 'always' },
  availabilitySchedule: {
    type: [{
      days: [Number],
      timeStart: String,
      timeEnd: String,
    }],
    default: [],
  },
})

const MenuSchema = new Schema<IMenu>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
      index: true,
    },
    categories: [MenuCategorySchema],
    optionImageRegistry: {
      type: Map,
      of: String,
      default: {},
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

MenuSchema.index({ tenantId: 1, locationId: 1 }, { unique: true })

// In development, always recreate to pick up schema changes across hot-reloads
if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).Menu
}

const Menu = mongoose.models.Menu || mongoose.model<IMenu>('Menu', MenuSchema)
export default Menu