import mongoose, { Schema, Document } from 'mongoose'

export type TiaInsightStatus = 'active' | 'dismissed' | 'resolved'
export type TiaInsightType =
  | 'sample_size'
  | 'central_tendency'
  | 'distribution'
  | 'variability'
  | 'historical'
  | 'category'
  | 'trend'
  | 'anomaly'

export type TiaSeverity = 'info' | 'warning' | 'critical'
export type TiaCategory = 'orders' | 'revenue' | 'products' | 'club' | 'conversion' | 'menu' | 'operations'

export interface ITiaInsight extends Document {
  tenantId: mongoose.Types.ObjectId
  type: TiaInsightType
  severity: TiaSeverity
  category: TiaCategory
  title: string
  description: string
  metric: string
  currentValue: number
  previousValue?: number
  changePercent?: number
  sampleSize: number
  recommendation?: string
  status: TiaInsightStatus
  generatedAt: Date
  dismissedAt?: Date
  resolvedAt?: Date
  source: 'sil' | 'daily-cron'
  createdAt: Date
  updatedAt: Date
}

const TiaInsightSchema = new Schema<ITiaInsight>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['sample_size', 'central_tendency', 'distribution', 'variability', 'historical', 'category', 'trend', 'anomaly'],
      required: true,
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      required: true,
    },
    category: {
      type: String,
      enum: ['orders', 'revenue', 'products', 'club', 'conversion', 'menu', 'operations'],
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String, required: true },
    metric: { type: String, required: true },
    currentValue: { type: Number, required: true },
    previousValue: { type: Number },
    changePercent: { type: Number },
    sampleSize: { type: Number, required: true, min: 0 },
    recommendation: { type: String },
    status: {
      type: String,
      enum: ['active', 'dismissed', 'resolved'],
      default: 'active',
    },
    generatedAt: { type: Date, default: Date.now },
    dismissedAt: { type: Date },
    resolvedAt: { type: Date },
    source: {
      type: String,
      enum: ['sil', 'daily-cron'],
      required: true,
    },
  },
  { timestamps: true }
)

TiaInsightSchema.index({ tenantId: 1, status: 1, generatedAt: -1 })
TiaInsightSchema.index({ tenantId: 1, type: 1, severity: 1 })

const TiaInsight =
  mongoose.models.TiaInsight ||
  mongoose.model<ITiaInsight>('TiaInsight', TiaInsightSchema)

export default TiaInsight
