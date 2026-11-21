import mongoose, { Schema, Document } from 'mongoose'

export type AppStoryType = 'feature' | 'tutorial' | 'promotion' | 'announcement'

// CP2 (20/11/2026): dueño y superficies. Valores por defecto y SIN migración:
// las stories viejas no tienen estos campos y cuentan como plataforma +
// menu_story (ver lib/app-story-owner.ts → effectiveOwner/effectiveSurfaces).
export type AppStorySurface = 'menu_story' | 'app_story' | 'home_banner'
export interface AppStoryOwner {
  kind: 'platform' | 'tenant'
  tenantId: mongoose.Types.ObjectId | null
  locationId: mongoose.Types.ObjectId | null
}

export interface IAppStory {
  title: string
  description: string
  shortDescription?: string
  imageUrl?: string
  videoUrl?: string
  type: AppStoryType
  ctaText?: string
  ctaLink?: string
  isActive: boolean
  sortOrder: number
  scheduledStart?: Date
  scheduledEnd?: Date
  customStyles?: {
    backgroundColor?: string
    textColor?: string
    accentColor?: string
  }
  owner?: AppStoryOwner
  surfaces?: AppStorySurface[]
  createdAt: Date
  updatedAt: Date
}

const AppStorySchema = new Schema<IAppStory>(
  {
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
    videoUrl: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      enum: ['feature', 'tutorial', 'promotion', 'announcement'],
      default: 'feature',
    },
    ctaText: {
      type: String,
      default: '',
    },
    ctaLink: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    scheduledStart: {
      type: Date,
      default: null,
    },
    scheduledEnd: {
      type: Date,
      default: null,
    },
    customStyles: {
      backgroundColor: { type: String, default: '' },
      textColor: { type: String, default: '' },
      accentColor: { type: String, default: '' },
    },
    owner: {
      kind: { type: String, enum: ['platform', 'tenant'], default: 'platform' },
      tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null },
      locationId: { type: Schema.Types.ObjectId, ref: 'Location', default: null },
    },
    // Lista abierta: sumar una superficie = agregar el valor acá y en lib/app-story-owner.ts.
    surfaces: {
      type: [{ type: String, enum: ['menu_story', 'app_story', 'home_banner'] }],
      default: ['menu_story'],
    },
  },
  {
    timestamps: true,
  }
)

AppStorySchema.index({ isActive: 1, sortOrder: 1 })
AppStorySchema.index({ 'owner.tenantId': 1, isActive: 1 }, { partialFilterExpression: { 'owner.kind': 'tenant' } })

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).AppStory
}

const AppStory = mongoose.models.AppStory || mongoose.model<IAppStory>('AppStory', AppStorySchema)
export default AppStory
