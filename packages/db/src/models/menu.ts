import mongoose, { Schema, type Document } from "mongoose"

// ============================================================================
// MenuModel — Light-read model for the `menus` collection
// Matches the schema defined in apps/saas/models/Menu.ts
// Used by the sync layer to query menu data for POS
// ============================================================================

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

export interface ICustomizationOption {
  _id?: mongoose.Types.ObjectId
  name: string
  extraPrice: number
  imageUrl?: string
  subGroups?: ICustomizationGroup[]
}

export interface ICustomizationGroup {
  _id?: mongoose.Types.ObjectId
  name: string
  type: "single" | "multiple"
  required: boolean
  options: ICustomizationOption[]
}

export interface IMenuItem {
  _id?: mongoose.Types.ObjectId
  name: string
  description: string
  price: number
  takeawayPrice?: number
  businessPrice?: number | null
  originalPrice?: number
  takeawayOriginalPrice?: number
  imageUrl: string
  isAvailable: boolean
  isTakeawayAvailable: boolean
  isBusinessAvailable: boolean
  tags: string[]
  isFeatured: boolean
  suggestWith?: string[]
  variants?: IMenuItemVariant[]
  customizationGroups: ICustomizationGroup[]
  nameTranslations?: { en: string }
  descriptionTranslations?: { en: string }
  availabilityMode?: "always" | "scheduled"
  availabilitySchedule?: Array<{
    days: number[]
    timeStart: string
    timeEnd: string
  }>
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
  printRole?: "kitchen" | "bar" | "both"
  customizationGroups?: ICustomizationGroup[]
  nameTranslations?: { en: string }
  descriptionTranslations?: { en: string }
  availabilityMode?: "always" | "scheduled"
  availabilitySchedule?: Array<{
    days: number[]
    timeStart: string
    timeEnd: string
  }>
}

export interface IMenuDocument extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  categories: IMenuCategory[]
  optionImageRegistry?: Record<string, string>
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// Nested schemas (lean enough to parse the same structure as SaaS)

const MenuItemVariantSchema = new Schema<IMenuItemVariant>(
  {
    name: { type: String, required: true },
    nameTranslations: { en: { type: String } },
    price: { type: Number, required: true },
    takeawayPrice: { type: Number },
    businessPrice: { type: Number },
    originalPrice: { type: Number },
    takeawayOriginalPrice: { type: Number },
  },
  { _id: true }
)

const CustomizationOptionSchema = new Schema<ICustomizationOption>({})
const CustomizationGroupSchema = new Schema<ICustomizationGroup>({})

CustomizationOptionSchema.add({
  name: { type: String, required: true },
  extraPrice: { type: Number, default: 0 },
  imageUrl: { type: String, default: "" },
  subGroups: { type: [CustomizationGroupSchema], default: [] },
})

CustomizationGroupSchema.add({
  name: { type: String, required: true },
  type: { type: String, enum: ["single", "multiple"], default: "single" },
  required: { type: Boolean, default: false },
  options: { type: [CustomizationOptionSchema], default: [] },
})

const MenuItemSchema = new Schema<IMenuItem>(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true },
    takeawayPrice: { type: Number },
    businessPrice: { type: Number, default: null },
    originalPrice: { type: Number },
    takeawayOriginalPrice: { type: Number },
    imageUrl: { type: String, default: "" },
    isAvailable: { type: Boolean, default: true },
    isTakeawayAvailable: { type: Boolean, default: true },
    isBusinessAvailable: { type: Boolean, default: false },
    tags: { type: [String], default: [] },
    isFeatured: { type: Boolean, default: false },
    suggestWith: { type: [String], default: [] },
    variants: { type: [MenuItemVariantSchema], default: [] },
    customizationGroups: { type: [CustomizationGroupSchema], default: [] },
    nameTranslations: { en: { type: String } },
    descriptionTranslations: { en: { type: String } },
    availabilityMode: {
      type: String,
      enum: ["always", "scheduled"],
      default: "always",
    },
    availabilitySchedule: { type: [Schema.Types.Mixed], default: [] },
  },
  { _id: true }
)

const MenuCategorySchema = new Schema<IMenuCategory>(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    isAvailable: { type: Boolean, default: true },
    isBusinessAvailable: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    items: { type: [MenuItemSchema], default: [] },
    printRole: {
      type: String,
      enum: ["kitchen", "bar", "both"],
      default: "kitchen",
    },
    customizationGroups: { type: [CustomizationGroupSchema], default: [] },
    nameTranslations: { en: { type: String } },
    descriptionTranslations: { en: { type: String } },
    availabilityMode: {
      type: String,
      enum: ["always", "scheduled"],
      default: "always",
    },
    availabilitySchedule: { type: [Schema.Types.Mixed], default: [] },
  },
  { _id: true }
)

const MenuSchema = new Schema<IMenuDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
      index: true,
    },
    categories: { type: [MenuCategorySchema], default: [] },
    optionImageRegistry: { type: Map, of: String, default: {} },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

MenuSchema.index({ tenantId: 1, locationId: 1 }, { unique: true })

export const MenuModel = mongoose.model<IMenuDocument>(
  "Menu",
  MenuSchema,
  "menus"
)
