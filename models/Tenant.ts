import mongoose, { Schema, Document } from 'mongoose'

export interface ITenant extends Document {
  name: string
  slug: string
  plan: 'trial' | 'try' | 'buy' | 'full'
  isActive: boolean
  branding: {
    primaryColor: string
    secondaryColor: string
    backgroundColor: string
    textColor: string
    logoUrl: string
    fontFamily: string
    borderRadius: 'sharp' | 'rounded' | 'pill'
    menuLayout: 'grid' | 'list'
    darkMode: boolean
  }
  profile: {
    menuDescription: string
    about: string
    social: {
      instagram: string
      facebook: string
      twitter: string
    }
  }
  features: {
    reservations: boolean
  }
  mercadopago: {
    accessToken: string | null
    publicKey: string | null
    webhookSecret: string | null
    isConfigured: boolean
  }
  createdAt: Date
  updatedAt: Date
}

const TenantSchema = new Schema<ITenant>(
  {
    name: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'El slug es obligatorio'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'El slug solo puede contener letras minúsculas, números y guiones'],
    },
    plan: {
      type: String,
      enum: ['trial', 'try', 'buy', 'full'],
      default: 'trial',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    branding: {
      primaryColor: { type: String, default: '#000000' },
      secondaryColor: { type: String, default: '#ffffff' },
      backgroundColor: { type: String, default: '#ffffff' },
      textColor: { type: String, default: '#000000' },
      logoUrl: { type: String, default: '' },
      fontFamily: { type: String, default: 'Inter' },
      borderRadius: {
        type: String,
        enum: ['sharp', 'rounded', 'pill'],
        default: 'rounded',
      },
      menuLayout: {
        type: String,
        enum: ['grid', 'list'],
        default: 'grid',
      },
      darkMode: { type: Boolean, default: false },
    },
    profile: {
      menuDescription: { type: String, default: '' },
      about: { type: String, default: '' },
      social: {
        instagram: { type: String, default: '' },
        facebook: { type: String, default: '' },
        twitter: { type: String, default: '' },
      },
    },
    features: {
      reservations: { type: Boolean, default: false },
    },
    mercadopago: {
      accessToken: { type: String, default: null },
      publicKey: { type: String, default: null },
      webhookSecret: { type: String, default: null },
      isConfigured: { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
  }
)

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).Tenant
}

const Tenant = mongoose.models.Tenant as mongoose.Model<ITenant> || mongoose.model<ITenant>('Tenant', TenantSchema)
export default Tenant
