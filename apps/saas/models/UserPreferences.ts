import mongoose, { Schema, Document } from 'mongoose'

export interface IUserPreferences extends Document {
  userId: mongoose.Types.ObjectId
  displayName: string
  age: number
  zone: string
  cuisinePreferences: string[]
  experiencePreferences: string[]
  onboardingCompleted: boolean
  hasSeenNetworkOnboarding: boolean
  notificationPermission: 'granted' | 'denied' | 'default'
  createdAt: Date
  updatedAt: Date
}

const UserPreferencesSchema = new Schema<IUserPreferences>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    displayName: {
      type: String,
      default: '',
      trim: true,
    },
    age: {
      type: Number,
      min: 10,
      max: 120,
    },
    zone: {
      type: String,
      default: '',
      trim: true,
    },
    cuisinePreferences: {
      type: [String],
      default: [],
    },
    experiencePreferences: {
      type: [String],
      default: [],
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
    hasSeenNetworkOnboarding: {
      type: Boolean,
      default: false,
    },
    notificationPermission: {
      type: String,
      enum: ['granted', 'denied', 'default'],
      default: 'default',
    },
  },
  {
    timestamps: true,
  }
)

UserPreferencesSchema.index({ userId: 1 })

const UserPreferences =
  mongoose.models.UserPreferences ||
  mongoose.model<IUserPreferences>('UserPreferences', UserPreferencesSchema)

export default UserPreferences
