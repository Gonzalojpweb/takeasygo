import mongoose, { Schema, Document } from 'mongoose'
import type { ComboPriceMode, ComboVisibility, ComboStyle } from '@takeasygo/types'

export interface ICombo extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId?: mongoose.Types.ObjectId | null
  name: string
  description?: string
  priceMode: ComboPriceMode
  /** @storedAs cents */
  fixedPrice?: number | null
  itemPool: string[]
  minItems: number
  maxItems: number
  allowRepeat: boolean
  chargeCustomizationExtras: boolean
  style?: ComboStyle
  isActive: boolean
  availabilitySchedule?: Record<string, any> | null
  sortOrder: number
  visibility: ComboVisibility
  createdAt: Date
  updatedAt: Date
}

const ComboStyleSchema = new Schema<ComboStyle>(
  {
    bgColor: { type: String, default: '' },
    textColor: { type: String, default: '' },
    badgeLabel: { type: String, default: '' },
    urgencyLabel: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
  },
  { _id: false }
)

const ComboSchema = new Schema<ICombo>(
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
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    priceMode: {
      type: String,
      enum: ['fixed', 'sumItems'],
      default: 'fixed',
      required: true,
    },
    fixedPrice: {
      type: Number,
      default: null,
    },
    itemPool: {
      type: [String],
      default: [],
    },
    minItems: {
      type: Number,
      default: 2,
    },
    maxItems: {
      type: Number,
      default: 2,
    },
    allowRepeat: {
      type: Boolean,
      default: true,
    },
    chargeCustomizationExtras: {
      type: Boolean,
      default: true,
    },
    style: {
      type: ComboStyleSchema,
      default: () => ({}),
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    availabilitySchedule: {
      type: Schema.Types.Mixed,
      default: null,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    visibility: {
      type: String,
      enum: ['dine-in', 'takeaway', 'both'],
      default: 'both',
    },
  },
  {
    timestamps: true,
  }
)

ComboSchema.index({ tenantId: 1, locationId: 1, isActive: 1, sortOrder: 1 })

export default (mongoose.models.Combo as mongoose.Model<ICombo>) ||
  mongoose.model<ICombo>('Combo', ComboSchema, 'combos')
