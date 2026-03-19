import mongoose, { Schema, Document } from 'mongoose'

// Singleton — siempre existe un solo documento con _id: 'platform'
export interface IPlatformConfig {
  _id: string
  mercadopago: {
    accessToken: string | null   // encriptado con AES-256
    webhookSecret: string | null // encriptado con AES-256
    isConfigured: boolean
  }
  updatedAt: Date
}

const PlatformConfigSchema = new Schema<IPlatformConfig>(
  {
    _id: { type: String, default: 'platform' },
    mercadopago: {
      accessToken:   { type: String, default: null },
      webhookSecret: { type: String, default: null },
      isConfigured:  { type: Boolean, default: false },
    },
  },
  { timestamps: true }
)

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).PlatformConfig
}

const PlatformConfig =
  mongoose.models.PlatformConfig ||
  mongoose.model<IPlatformConfig>('PlatformConfig', PlatformConfigSchema)

export default PlatformConfig
