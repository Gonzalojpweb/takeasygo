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
  /** Comisiones globales de la plataforma */
  platformFees: {
    takeasygoCommissionPercent: number         // % que cobra TakeasyGO (default: 1)
    takeasygoTransferCommissionPercent: number // % por transferencia (default: 0)
    /** % por efectivo cuando la matriz del tenant lo habilita y no tiene % propio (default: 0) */
    takeasygoCashCommissionPercent: number
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
  /** Maintenance mode — when true, POST /orders returns 503 */
  maintenanceMode: boolean
  /** Multi-marca PR 2: quién decide el acceso a un comercio (lib/access-central). */
  accessCentral?: 'off' | 'log' | 'enforce'
  /** Multi-marca PR 8: proyección de membresías de organización (lib/org-access). */
  orgAccess?: 'off' | 'log' | 'enforce'
  /** Multi-marca PR 10: panel con los números del grupo en /grupo/[slug] (lib/org-access). */
  orgDashboard?: 'off' | 'on'
  /** Multi-marca PR 6: CUIT + punto de venta únicos entre comercios (lib/fiscal/pos-claims). */
  fiscalPosClaims?: 'off' | 'enforce'
  /** Multi-marca PR 6 (S6): alias de CSR por marca cuando el CUIT es compartido. */
  fiscalCsrAliasShared?: 'off' | 'on'
  /** Google Contacts sync cron cursor (persisted between runs) */
  gcSyncCursor: {
    lastUserId: string | null
    lastRunAt: Date | null
  }
  /** Candado distribuido para el cron de renovación OAuth MP (un solo ejecutor) */
  mpOauthRenewLock: {
    until: Date | null
    owner: string | null
    acquiredAt: Date | null
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
    /** Comisiones globales de la plataforma */
    platformFees: {
      takeasygoCommissionPercent:         { type: Number, default: 1, min: 0, max: 100 },
      takeasygoTransferCommissionPercent: { type: Number, default: 0, min: 0, max: 100 },
      takeasygoCashCommissionPercent:     { type: Number, default: 0, min: 0, max: 100 },
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
    maintenanceMode: { type: Boolean, default: false },
    // Multi-marca PR 2 (06/11/2026): off = como siempre (JWT).
    accessCentral: { type: String, enum: ['off', 'log', 'enforce'], default: 'off' },
    // Multi-marca PR 8: off = las membresías no dan acceso (como hoy).
    orgAccess: { type: String, enum: ['off', 'log', 'enforce'], default: 'off' },
    // Multi-marca PR 10: off = /grupo/[slug] no existe (404).
    orgDashboard: { type: String, enum: ['off', 'on'], default: 'off' },
    // Multi-marca PR 6: apagados = guardado fiscal y certificados como hoy.
    fiscalPosClaims: { type: String, enum: ['off', 'enforce'], default: 'off' },
    fiscalCsrAliasShared: { type: String, enum: ['off', 'on'], default: 'off' },
    gcSyncCursor: {
      lastUserId: { type: String, default: null },
      lastRunAt:  { type: Date, default: null },
    },
    mpOauthRenewLock: {
      until:      { type: Date, default: null },
      owner:      { type: String, default: null },
      acquiredAt: { type: Date, default: null },
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
