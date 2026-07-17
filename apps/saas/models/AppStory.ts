import mongoose, { Schema, Document } from 'mongoose'

export type AppStoryType = 'feature' | 'tutorial' | 'promotion' | 'announcement'

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
  },
  {
    timestamps: true,
  }
)

AppStorySchema.index({ isActive: 1, sortOrder: 1 })

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).AppStory
}

const AppStory = mongoose.models.AppStory || mongoose.model<IAppStory>('AppStory', AppStorySchema)
export default AppStory
