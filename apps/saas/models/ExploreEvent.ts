import mongoose, { Schema, Document } from 'mongoose'

export type ExploreEventType =
  | 'pageview'
  | 'search'
  | 'restaurant_view'
  | 'click_menu'
  | 'click_lead'
  | 'view_change'
  | 'share'

export type ExploreView = 'home' | 'list' | 'map' | 'orders' | 'detail'

export interface IExploreEvent extends Document {
  sessionId: string
  userId: mongoose.Types.ObjectId | null
  eventType: ExploreEventType
  view: ExploreView | null
  restaurantId: mongoose.Types.ObjectId | null
  tenantSlug: string | null
  searchQuery: string | null
  filters: {
    cuisine: string | null
    openNow: boolean | null
    radius: number | null
  } | null
  coordinates: {
    lat: number | null
    lng: number | null
  } | null
  ip: string | null
  userAgent: string | null
  deviceType: 'mobile' | 'desktop' | 'unknown'
  source: string
  referrer: string | null
  metadata: Record<string, any>
  createdAt: Date
}

const ExploreEventSchema = new Schema<IExploreEvent>({
  sessionId: {
    type: String,
    required: true,
    index: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  eventType: {
    type: String,
    enum: ['pageview', 'search', 'restaurant_view', 'click_menu', 'click_lead', 'view_change', 'share'],
    required: true,
    index: true,
  },
  view: {
    type: String,
    enum: ['home', 'list', 'map', 'orders', 'detail'],
    default: null,
  },
  restaurantId: {
    type: Schema.Types.ObjectId,
    default: null,
  },
  tenantSlug: {
    type: String,
    default: null,
    index: true,
  },
  searchQuery: {
    type: String,
    default: null,
  },
  filters: {
    type: new Schema({
      cuisine: { type: String, default: null },
      openNow: { type: Boolean, default: null },
      radius: { type: Number, default: null },
    }, { _id: false }),
    default: null,
  },
  coordinates: {
    type: new Schema({
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    }, { _id: false }),
    default: null,
  },
  ip: { type: String, default: null },
  userAgent: { type: String, default: null },
  deviceType: {
    type: String,
    enum: ['mobile', 'desktop', 'unknown'],
    default: 'unknown',
  },
  source: {
    type: String,
    default: 'direct',
  },
  referrer: { type: String, default: null },
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, {
  timestamps: false,
  versionKey: false,
})

ExploreEventSchema.index({ eventType: 1, createdAt: -1 })
ExploreEventSchema.index({ sessionId: 1, createdAt: -1 })
ExploreEventSchema.index({ tenantSlug: 1, createdAt: -1 })
ExploreEventSchema.index({ restaurantId: 1, createdAt: -1 })

const ExploreEvent = mongoose.models.ExploreEvent || mongoose.model<IExploreEvent>('ExploreEvent', ExploreEventSchema)
export default ExploreEvent
