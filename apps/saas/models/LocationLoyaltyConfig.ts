import mongoose, { Schema, Document } from 'mongoose'

export interface ILocationLoyaltyConfig extends Document {
  locationId: mongoose.Types.ObjectId

  // Club basics (per-location)
  enabled: boolean
  clubName: string
  welcomeMessage: string

  // Points configuration (per-location)
  pointsConfig: {
    enabled: boolean
    mode: 'fixed_per_currency' | 'percentage' | 'hybrid'
    pointsPerCurrency: number
    pointsPercentage: number
    pointsPerOrder: number
    /** Monto mínimo para acumular puntos en centavos. @storedAs cents */
    minOrderForPoints: number
    /** Valor en centavos de cada 1 punto al canjear. @storedAs cents */
    pointsRedemptionValue: number
    redemptionEnabled: boolean
    welcomePoints: number
  }

  // Store configuration (per-location)
  store: {
    enabled: boolean
    title: string
    description: string
    heroImageUrl?: string
    allowOnlineRedemption: boolean
    redemptionExpiryHours?: number
    enableCheckoutRedemption: boolean
  }

  createdAt: Date
  updatedAt: Date
}

const LocationLoyaltyConfigSchema = new Schema<ILocationLoyaltyConfig>(
  {
    locationId: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
      unique: true,
      index: true,
    },

    enabled: { type: Boolean, default: false },

    clubName: { type: String, default: 'Club TakeasyGO' },

    welcomeMessage: { type: String, default: '¡Bienvenido al club de fidelización!' },

    pointsConfig: {
      enabled: { type: Boolean, default: false },
      mode: { type: String, enum: ['fixed_per_currency', 'percentage', 'hybrid'], default: 'fixed_per_currency' },
      pointsPerCurrency: { type: Number, default: 0.1, min: 0 },
      pointsPercentage: { type: Number, default: 10, min: 0, max: 100 },
      pointsPerOrder: { type: Number, default: 0, min: 0 },
      minOrderForPoints: { type: Number, default: 0, min: 0 },
      pointsRedemptionValue: { type: Number, default: 10, min: 0 },
      redemptionEnabled: { type: Boolean, default: true },
      welcomePoints: { type: Number, default: 0, min: 0 },
    },

    store: {
      enabled: { type: Boolean, default: false },
      title: { type: String, default: 'Tienda de Recompensas' },
      description: { type: String, default: 'Canjea tus puntos por recompensas exclusivas' },
      heroImageUrl: { type: String, default: '' },
      allowOnlineRedemption: { type: Boolean, default: false },
      redemptionExpiryHours: { type: Number, default: 24, min: 1, max: 168 },
      enableCheckoutRedemption: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
)

const LocationLoyaltyConfig =
  mongoose.models.LocationLoyaltyConfig ||
  mongoose.model<ILocationLoyaltyConfig>('LocationLoyaltyConfig', LocationLoyaltyConfigSchema)

export default LocationLoyaltyConfig
