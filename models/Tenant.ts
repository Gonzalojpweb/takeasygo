import mongoose, { Schema, Document } from 'mongoose'

export interface ITenant extends Document {
  name: string
  slug: string
  plan: 'try' | 'buy' | 'full'
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
  },
  mercadopago: {
  accessToken: string | null
  publicKey: string | null
  isConfigured: boolean
},
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
      enum: ['try', 'buy', 'full'],
      required: true,
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
    mercadopago: {
  accessToken: { type: String, default: null },
  publicKey: { type: String, default: null },
  isConfigured: { type: Boolean, default: false },
  },
  },
  {
    timestamps: true,
  }
)

const Tenant = mongoose.models.Tenant || mongoose.model<ITenant>('Tenant', TenantSchema)
export default Tenant