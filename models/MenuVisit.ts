import mongoose, { Schema, Document } from 'mongoose'

export type TrafficSource = 'instagram' | 'facebook' | 'qr' | 'whatsapp' | 'google' | 'direct' | 'other' | null

export interface IMenuVisit extends Document {
  tenantId: mongoose.Types.ObjectId
  visitedAt: Date
  ip: string | null
  userAgent: string | null
  deviceType: 'mobile' | 'desktop' | 'unknown'
  source: TrafficSource
  referrer: string | null
  locationPath: string | null
}

const MenuVisitSchema = new Schema<IMenuVisit>({
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  visitedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  ip: {
    type: String,
    default: null,
  },
  userAgent: {
    type: String,
    default: null,
  },
  deviceType: {
    type: String,
    enum: ['mobile', 'desktop', 'unknown'],
    default: 'unknown',
  },
  source: {
    type: String,
    enum: ['instagram', 'facebook', 'qr', 'whatsapp', 'google', 'direct', 'other', null],
    default: null,
    index: true,
  },
  referrer: {
    type: String,
    default: null,
  },
  locationPath: {
    type: String,
    default: null,
  },
}, {
  timestamps: false,
})

MenuVisitSchema.index({ tenantId: 1, visitedAt: -1 })

const MenuVisit = mongoose.models.MenuVisit || mongoose.model<IMenuVisit>('MenuVisit', MenuVisitSchema)
export default MenuVisit
