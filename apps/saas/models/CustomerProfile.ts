import mongoose, { Schema, Document } from 'mongoose'
import type { CustomerSegment, CustomerSignal, CustomerHealthScore, HealthScoreHistoryEntry } from '@/types/cis'

// ─────────────────────────────────────────────────────────────────────────────
// models/CustomerProfile.ts — Perfil enriquecido del cliente (CDL + CML)
// ─────────────────────────────────────────────────────────────────────────────
// Propósito: Extender el modelo Consumer con datos de inteligencia.
// Relación 1:1 con Consumer por phoneHash.
// NO modifica el Consumer existente (evita romper sync Order → Consumer).
//
// Decisión: Modelo separado (no agregar campos a Consumer) porque:
// 1. Consumer ya tiene sync pipeline funcionando (Order.create → upsert)
// 2. Modificar Consumer = riesgo de romper la creación de órdenes
// 3. CustomerProfile se actualiza en batch (cron), no en tiempo real
// 4. Permite evolucionar independientemente del modelo base
// ─────────────────────────────────────────────────────────────────────────────

export interface ICustomerProfile extends Document {
  // Identificador
  consumerId: mongoose.Types.ObjectId
  phoneHash: string
  tenantId: mongoose.Types.ObjectId

  // Métricas CML (calculadas por cron)
  orderCount: number
  totalSpent: number
  avgTicket: number
  lifetimeValue: number
  firstOrderAt: Date | null
  lastOrderAt: Date | null
  daysSinceLastOrder: number | null
  daysSinceFirstOrder: number | null
  visitFrequency: number
  avgOrderInterval: number

  // Favoritos
  favoriteCategories: { category: string; count: number }[]
  favoriteProducts: { product: string; count: number }[]
  favoriteDays: number[]
  favoriteHours: number[]
  uniqueProducts: number

  // Engagement
  menuViews: number
  productViews: number
  cartAdds: number
  checkoutStarts: number
  completedOrders: number
  conversionRate: number

  // Rewards
  rewardUsageCount: number
  rewardUsageRate: number

  // Club
  clubJoinDate: Date | null
  clubStatus: string | null
  clubPoints: number

  // Inteligencia (CIL)
  segment: CustomerSegment
  signals: CustomerSignal[]
  lastSegmentAt: Date | null
  lastSignalsAt: Date | null

  // Health Score (P3 — desde el día 1)
  healthScore: CustomerHealthScore
  healthScoreHistory: HealthScoreHistoryEntry[]
  lastHealthScoreAt: Date | null

  // Metadatos
  metricsCalculatedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const CustomerProfileSchema = new Schema<ICustomerProfile>(
  {
    consumerId: { type: Schema.Types.ObjectId, ref: 'Consumer', required: true },
    phoneHash: { type: String, required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },

    // CML — Métricas
    orderCount: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    avgTicket: { type: Number, default: 0 },
    lifetimeValue: { type: Number, default: 0 },
    firstOrderAt: { type: Date, default: null },
    lastOrderAt: { type: Date, default: null },
    daysSinceLastOrder: { type: Number, default: null },
    daysSinceFirstOrder: { type: Number, default: null },
    visitFrequency: { type: Number, default: 0 },
    avgOrderInterval: { type: Number, default: 0 },

    // Favoritos
    favoriteCategories: [{ category: String, count: Number }],
    favoriteProducts: [{ product: String, count: Number }],
    favoriteDays: [Number],
    favoriteHours: [Number],
    uniqueProducts: { type: Number, default: 0 },

    // Engagement
    menuViews: { type: Number, default: 0 },
    productViews: { type: Number, default: 0 },
    cartAdds: { type: Number, default: 0 },
    checkoutStarts: { type: Number, default: 0 },
    completedOrders: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },

    // Rewards
    rewardUsageCount: { type: Number, default: 0 },
    rewardUsageRate: { type: Number, default: 0 },

    // Club
    clubJoinDate: { type: Date, default: null },
    clubStatus: { type: String, default: null },
    clubPoints: { type: Number, default: 0 },

    // Inteligencia
    segment: { type: String, default: 'NEW' },
    signals: [{ type: String }],
    lastSegmentAt: { type: Date, default: null },
    lastSignalsAt: { type: Date, default: null },

    // Health Score
    healthScore: {
      total: { type: Number, default: 0 },
      components: {
        frequency: { type: Number, default: 0 },
        recency: { type: Number, default: 0 },
        ltv: { type: Number, default: 0 },
        engagement: { type: Number, default: 0 },
        club: { type: Number, default: 0 },
        rewards: { type: Number, default: 0 },
        conversion: { type: Number, default: 0 },
      },
      calculatedAt: { type: Date, default: null },
    },
    healthScoreHistory: [{
      date: Date,
      score: Number,
      components: Schema.Types.Mixed,
      segment: String,
    }],
    lastHealthScoreAt: { type: Date, default: null },

    metricsCalculatedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// Índices
CustomerProfileSchema.index({ phoneHash: 1, tenantId: 1 }, { unique: true })
CustomerProfileSchema.index({ consumerId: 1 })
CustomerProfileSchema.index({ tenantId: 1, segment: 1 })
CustomerProfileSchema.index({ tenantId: 1, 'healthScore.total': -1 })
CustomerProfileSchema.index({ tenantId: 1, lastOrderAt: -1 })
CustomerProfileSchema.index({ tenantId: 1, orderCount: -1 })

// HMR guard (patrón ICOSnapshot)
if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).CustomerProfile
}

const CustomerProfile =
  mongoose.models.CustomerProfile ||
  mongoose.model<ICustomerProfile>('CustomerProfile', CustomerProfileSchema)

export default CustomerProfile
