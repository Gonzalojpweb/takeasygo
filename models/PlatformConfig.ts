import mongoose, { Schema, Document } from 'mongoose'

// Singleton — siempre existe un solo documento con _id: 'platform'
export interface IPlatformConfig {
  _id: string
  mercadopago: {
    accessToken: string | null   // encriptado con AES-256
    webhookSecret: string | null // encriptado con AES-256
    isConfigured: boolean
  }
  /** Configuración por defecto para promoción QR de takeaway */
  qrPromoDefaults: {
    title: string
    subtitle: string
    buttonText: string
    termsText: string
    defaultDiscountPercentage: number
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
    /** Configuración por defecto para promoción QR de takeaway */
    qrPromoDefaults: {
      title: { type: String, default: '¡Primera vez por QR!' },
      subtitle: { type: String, default: 'Obtené {discount}% OFF en tu primer pedido takeaway' },
      buttonText: { type: String, default: 'Ver menú' },
      termsText: { type: String, default: 'Válido solo para pedidos takeaway. No acumulable con otras promociones.' },
      defaultDiscountPercentage: { type: Number, default: 15, min: 0, max: 100 },
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
