import mongoose, { Schema, Document } from 'mongoose'

export interface ICoOccurrencePair {
  itemA: string // menuItemId (string)
  itemB: string // menuItemId (string)
  count: number // cantidad de órdenes donde aparecen juntos
}

export interface IMenuInsights extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  pairs: ICoOccurrencePair[]
  totalOrdersAnalyzed: number
  computedAt: Date
}

const CoOccurrencePairSchema = new Schema<ICoOccurrencePair>(
  {
    itemA: { type: String, required: true },
    itemB: { type: String, required: true },
    count: { type: Number, required: true },
  },
  { _id: false },
)

const MenuInsightsSchema = new Schema<IMenuInsights>(
  {
    tenantId:             { type: Schema.Types.ObjectId, required: true, ref: 'Tenant' },
    locationId:           { type: Schema.Types.ObjectId, required: true, ref: 'Location' },
    pairs:                { type: [CoOccurrencePairSchema], default: [] },
    totalOrdersAnalyzed:  { type: Number, default: 0 },
    computedAt:           { type: Date, required: true },
  },
  { timestamps: false },
)

// Un documento por (tenant, location)
MenuInsightsSchema.index({ tenantId: 1, locationId: 1 }, { unique: true })

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).MenuInsights
}

const MenuInsights =
  (mongoose.models.MenuInsights as mongoose.Model<IMenuInsights>) ||
  mongoose.model<IMenuInsights>('MenuInsights', MenuInsightsSchema)

export default MenuInsights
