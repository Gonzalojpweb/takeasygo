import mongoose, { Schema, Document } from 'mongoose'

export interface ICustomizationOption {
  _id?: mongoose.Types.ObjectId
  name: string
  extraPrice: number
  subGroups?: ICustomizationGroup[]  // Grupos que se activan si esta opción es elegida
}

export interface ICustomizationGroup {
  _id?: mongoose.Types.ObjectId
  name: string
  type: 'single' | 'multiple'
  required: boolean
  options: ICustomizationOption[]
}

export interface IMenuItemVariant {
  _id?: mongoose.Types.ObjectId
  name: string
  nameTranslations?: { en: string }
  price: number
  takeawayPrice?: number
  businessPrice?: number
  originalPrice?: number
  takeawayOriginalPrice?: number
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
  printRole?: 'kitchen' | 'bar' | 'both'
  price: number
  takeawayPrice?: number
  businessPrice?: number | null
  /** Precio original de lista (antes de descuentos de categoría). Se guarda una sola vez. */
  originalPrice?: number
  /** Precio takeaway original de lista (antes de descuentos de categoría). Se guarda una sola vez. */
  takeawayOriginalPrice?: number
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
}

export interface IMenuCategory {
  _id?: mongoose.Types.ObjectId
  name: string
  description: string
  imageUrl: string
  isAvailable: boolean
  isBusinessAvailable: boolean
  sortOrder: number
  items: IMenuItem[]
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
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const MenuItemVariantSchema = new Schema<IMenuItemVariant>({
  name: { type: String, required: true, trim: true },
  nameTranslations: {
    en: { type: String, default: '' },
  },
  price: { type: Number, required: true, min: 0 },
  takeawayPrice: { type: Number, min: 0 },
  businessPrice: { type: Number, min: 0 },
  originalPrice: { type: Number, min: 0 },
  takeawayOriginalPrice: { type: Number, min: 0 },
}, { _id: true })

// Declarados como Schema genérico primero para permitir referencia circular opción ↔ grupo
const CustomizationOptionSchema: Schema = new Schema({})
const CustomizationGroupSchema: Schema = new Schema({})

// Se agregan los campos después de que ambos schemas existen (resuelve la referencia circular)
CustomizationOptionSchema.add({
  name:       { type: String, required: true, trim: true },
  extraPrice: { type: Number, default: 0, min: 0 },
  subGroups:  { type: [CustomizationGroupSchema], default: [] },
})

CustomizationGroupSchema.add({
  name:     { type: String, required: true, trim: true },
  type:     { type: String, enum: ['single', 'multiple'], default: 'single' },
  required: { type: Boolean, default: false },
  options:  { type: [CustomizationOptionSchema], default: [] },
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
  price: {
    type: Number,
    required: [true, 'El precio es obligatorio'],
    min: [0, 'El precio no puede ser negativo'],
  },
  takeawayPrice: {
    type: Number,
    min: [0, 'El precio para llevar no puede ser negativo'],
  },
  businessPrice: {
    type: Number,
    min: [0, 'El precio business no puede ser negativo'],
    default: null,
  },
  originalPrice: {
    type: Number,
    min: [0, 'El precio original no puede ser negativo'],
  },
  takeawayOriginalPrice: {
    type: Number,
    min: [0, 'El precio takeaway original no puede ser negativo'],
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
  printRole: {
    type: String,
    enum: ['kitchen', 'bar', 'both'],
    default: 'kitchen',
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