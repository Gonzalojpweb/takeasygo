import mongoose, { Schema, Document } from 'mongoose'

export interface ICustomizationOption {
  _id?: mongoose.Types.ObjectId
  name: string
  extraPrice: number
}

export interface ICustomizationGroup {
  _id?: mongoose.Types.ObjectId
  name: string
  type: 'single' | 'multiple'
  required: boolean
  options: ICustomizationOption[]
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
  price: number
  imageUrl: string
  isAvailable: boolean
  tags: string[]
  isFeatured: boolean
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
  sortOrder: number
  items: IMenuItem[]
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

const CustomizationOptionSchema = new Schema<ICustomizationOption>({
  name: { type: String, required: true, trim: true },
  extraPrice: { type: Number, default: 0, min: 0 },
})

const CustomizationGroupSchema = new Schema<ICustomizationGroup>({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['single', 'multiple'], default: 'single' },
  required: { type: Boolean, default: false },
  options: [CustomizationOptionSchema],
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
  imageUrl: {
    type: String,
    default: '',
  },
  isAvailable: {
    type: Boolean,
    default: true,
  },
  tags: {
    type: [String],
    default: [],
  },
  isFeatured: {
    type: Boolean,
    default: false,
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
  sortOrder: {
    type: Number,
    default: 0,
  },
  items: [MenuItemSchema],
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