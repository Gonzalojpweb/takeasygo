import mongoose, { Schema, Document } from 'mongoose'

export interface IMenuItem {
  _id?: mongoose.Types.ObjectId
  name: string
  description: string
  price: number
  imageUrl: string
  isAvailable: boolean
  tags: string[]
  isFeatured: boolean
}

export interface IMenuCategory {
  _id?: mongoose.Types.ObjectId
  name: string
  description: string
  isAvailable: boolean
  sortOrder: number
  items: IMenuItem[]
}

export interface IMenu extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  categories: IMenuCategory[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

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
  isAvailable: {
    type: Boolean,
    default: true,
  },
  sortOrder: {
    type: Number,
    default: 0,
  },
  items: [MenuItemSchema],
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

const Menu = mongoose.models.Menu || mongoose.model<IMenu>('Menu', MenuSchema)
export default Menu