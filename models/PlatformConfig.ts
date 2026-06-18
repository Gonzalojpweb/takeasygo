import mongoose, { Schema, Document } from 'mongoose'

// Singleton — siempre existe un solo documento con _id: 'platform'
export interface IPlatformConfig {
  _id: string
  mercadopago: {
    accessToken: string | null   // encriptado con AES-256
    webhookSecret: string | null // encriptado con AES-256
    isConfigured: boolean
  }
  /** OAuth configuration for Marketplace Split Payments (configured by superadmin) */
  mpOAuth: {
    appId: string | null           // MercadoPago App ID for the platform
    appSecret: string | null       // MercadoPago App Secret (encrypted AES-256-GCM)
    redirectUri: string | null     // OAuth redirect URI
    platformFeePercent: number     // Platform commission percentage (default: 5)
  }
  /** Configuración global de Kripton */
  kripton: {
    enabled: boolean
    defaultCryptoNetworkId: number | null
    defaultUsePaymentLinks: boolean
  }
  /** Configuración de estilos estándar para promoción QR de takeaway */
  qrPromoStyles: {
    primaryColor: string
    backgroundColor: string
    badgeColor: string
    borderRadius: string
    buttonColor: string
  }
  /** Configuración global de SOS (hard-cap que el superadmin fija para toda la plataforma) */
  sosConfig: {
    globalSosLimit: number
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
    /** OAuth configuration for Marketplace Split Payments (configured by superadmin) */
    mpOAuth: {
      appId:              { type: String, default: null },
      appSecret:          { type: String, default: null },
      redirectUri:        { type: String, default: null },
      platformFeePercent: { type: Number, default: 5 },
    },
    /** Configuración global de Kripton */
    kripton: {
      enabled:                { type: Boolean, default: false },
      defaultCryptoNetworkId: { type: Number, default: null },
      defaultUsePaymentLinks: { type: Boolean, default: true },
    },
    /** Configuración de estilos estándar para promoción QR de takeaway */
    qrPromoStyles: {
      primaryColor: { type: String, default: '#F74211' },
      backgroundColor: { type: String, default: '#FFF5F0' },
      badgeColor: { type: String, default: '#F74211' },
      borderRadius: { type: String, default: '1.5rem' },
      buttonColor: { type: String, default: '#F74211' },
    },
    /** Configuración global de SOS (hard-cap que el superadmin fija para toda la plataforma) */
    sosConfig: {
      globalSosLimit: { type: Number, default: 250, min: 0 },
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
