import mongoose, { Schema, Document } from 'mongoose'
import type { ICustomizationGroup } from './Menu'
import { type SlotCustomizationMode, resolveSlotCustomizationMode } from '@/lib/promotion-helpers'

export type PromotionType = 'sale' | 'info' | 'announcement' | 'loyalty'

// Re-export for backward compatibility
export { type SlotCustomizationMode, resolveSlotCustomizationMode }

/** Poda de árbol de customización por ítem dentro de un slot */
export interface IPromotionItemOverride {
  itemId: mongoose.Types.ObjectId
  /** Variantes del ítem a ocultar para esta promo (blocklist) */
  disabledVariantNames?: string[]
  /** Grupos de customizationGroups a ocultar enteros (solo aplica a los NO requeridos) */
  disabledGroupIds?: mongoose.Types.ObjectId[]
  /** Opciones puntuales a ocultar dentro de un grupo, a cualquier profundidad */
  disabledOptionIds?: string[]
}

export interface IPromotionSlot {
  name: string
  categoryIds?: mongoose.Types.ObjectId[]
  itemIds?: mongoose.Types.ObjectId[]
  requiredQuantity: number
  /** Modo por defecto del slot — 'none' = directo, 'variant' = picker variante, 'full' = modal completo */
  customizationMode?: SlotCustomizationMode
  /** @deprecated Usar customizationMode */
  allowCustomization?: boolean
  overrideCustomizationGroups?: ICustomizationGroup[]
  /** Poda de customización por ítem — refinamiento fino sobre customizationMode */
  itemOverrides?: IPromotionItemOverride[]
}

export interface IPromotion {
  tenantId?: mongoose.Types.ObjectId
  locationId?: mongoose.Types.ObjectId
  scope: 'tenant' | 'global'
  targetTenants?: mongoose.Types.ObjectId[]
  type: PromotionType
  title: string
  description: string
  shortDescription?: string
  imageUrl?: string
  /** Precio de la promoción en centavos. @storedAs cents */
  price: number
  /** Precio original antes del descuento en centavos. @storedAs cents */
  originalPrice?: number
  currency: string
  conditions?: string
  details?: string
  ctaText?: string
  ctaLink?: string
  visibility: 'both' | 'takeaway' | 'dine-in'
  isActive: boolean
  isFeatured: boolean
  scheduledStart?: Date
  scheduledEnd?: Date
  activeTimeStart?: string
  activeTimeEnd?: string
  customStyles?: {
    backgroundColor?: string
    textColor?: string
    accentColor?: string
    badgeColor?: string
    borderRadius?: string
    cardStyle?: 'modern' | 'classic' | 'minimal'
  }
  maxRedemptions?: number
  redemptionsCount: number
  sortOrder: number
  /** REQUERIDO para type === 'sale'. Ignorado para info/announcement/loyalty. */
  slots: IPromotionSlot[]
  /** Default true — aplica como default a todos los slots */
  allowCustomization?: boolean
  /** A nivel promo, se fusiona con el de cada slot */
  overrideCustomizationGroups?: ICustomizationGroup[]
  createdAt: Date
  updatedAt: Date
}

const PromotionSlotSchema = new Schema<IPromotionSlot>({
  name: { type: String, required: true, trim: true },
  categoryIds: { type: [Schema.Types.ObjectId], default: [] },
  itemIds: { type: [Schema.Types.ObjectId], default: [] },
  requiredQuantity: { type: Number, required: true, min: 1 },
  customizationMode: { type: String, enum: ['none', 'variant', 'full'], default: null },
  allowCustomization: { type: Boolean, default: null },
  overrideCustomizationGroups: { type: [Schema.Types.Mixed], default: [] },
  itemOverrides: {
    type: [{
      itemId: { type: Schema.Types.ObjectId, required: true },
      disabledVariantNames: { type: [String], default: [] },
      disabledGroupIds: { type: [Schema.Types.ObjectId], default: [] },
      disabledOptionIds: { type: [String], default: [] },
    }],
    default: [],
  },
}, { _id: false })

const PromotionSchema = new Schema<IPromotion>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: false,
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
    locationId: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      default: null,
    },
    type: {
      type: String,
      enum: ['sale', 'info', 'announcement', 'loyalty'],
      default: 'sale',
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    shortDescription: {
      type: String,
      default: '',
      trim: true,
    },
    imageUrl: {
      type: String,
      default: '',
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    originalPrice: {
      type: Number,
      default: null,
      min: 0,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    conditions: {
      type: String,
      default: '',
    },
    details: {
      type: String,
      default: '',
    },
    ctaText: {
      type: String,
      default: '',
    },
    ctaLink: {
      type: String,
      default: '',
    },
    visibility: {
      type: String,
      enum: ['both', 'takeaway', 'dine-in'],
      default: 'both',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    scheduledStart: {
      type: Date,
      default: null,
    },
    scheduledEnd: {
      type: Date,
      default: null,
    },
    activeTimeStart: {
      type: String,
      default: null,
    },
    activeTimeEnd: {
      type: String,
      default: null,
    },
    customStyles: {
      backgroundColor: { type: String, default: '' },
      textColor: { type: String, default: '' },
      accentColor: { type: String, default: '' },
      badgeColor: { type: String, default: '' },
      borderRadius: { type: String, default: '' },
      cardStyle: { type: String, enum: ['modern', 'classic', 'minimal'], default: 'modern' },
    },
    maxRedemptions: {
      type: Number,
      default: null,
    },
    redemptionsCount: {
      type: Number,
      default: 0,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    slots: {
      type: [PromotionSlotSchema],
      default: [],
    },
    allowCustomization: {
      type: Boolean,
      default: true,
    },
    overrideCustomizationGroups: {
      type: [Schema.Types.Mixed],
      default: [],
    },
  },
  {
    timestamps: true,
  }
)

PromotionSchema.index({ tenantId: 1, isActive: 1 })
PromotionSchema.index({ tenantId: 1, locationId: 1, visibility: 1 })

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).Promotion
}

const Promotion = mongoose.models.Promotion || mongoose.model<IPromotion>('Promotion', PromotionSchema)
export default Promotion
