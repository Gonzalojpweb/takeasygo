import mongoose, { Schema, Document } from 'mongoose'
import type { CustomerEventType } from '@/types/cis'

// ─────────────────────────────────────────────────────────────────────────────
// models/CustomerEvent.ts — Eventos crudos del cliente (P7)
// ─────────────────────────────────────────────────────────────────────────────
// Propósito: Almacenar cada evento relevante del cliente de forma cruda.
//
// Ley P7: "Nunca guardar solamente métricas. Guardar también eventos."
// Razón: Dentro de 2 años vas a querer calcular algo nuevo. Si no tenés
// eventos históricos, perdiste la posibilidad. Las métricas se pueden
// recalcular; los eventos no se pueden recrear.
//
// Diseño:
// - Documento ligero (~200 bytes promedio)
// - TTL de 2 años (purged por cron)
// - Índices optimizados para queries por cliente y por tenant
// - Campo `data` genérico para flexibilidad
// ─────────────────────────────────────────────────────────────────────────────

export interface ICustomerEvent extends Document {
  phoneHash: string
  tenantId: mongoose.Types.ObjectId
  type: CustomerEventType
  data: {
    orderId?: mongoose.Types.ObjectId
    itemName?: string
    itemCategory?: string
    /** Monto en centavos. @storedAs cents */
    amount?: number
    rewardId?: string
    segment?: string
    signal?: string
    healthScore?: number
    previousHealthScore?: number
    // Extended fields — Spec v1.0
    menuItemId?: mongoose.Types.ObjectId
    promotionId?: mongoose.Types.ObjectId
    source?: string
    quantity?: number
    hasCustomizations?: boolean
    customizations?: Record<string, unknown>
    paymentMethod?: string
    orderMode?: string
    previousStatus?: string
    newStatus?: string
    stars?: number
    discountAmount?: number
    insightType?: string
    insightSeverity?: string
    field?: string
    found?: boolean
    points?: number
    redeemType?: string
  }
  metadata: {
    source: 'order' | 'posthog' | 'posthog_sync' | 'explore' | 'loyalty' | 'cron' | 'manual' | 'client_side'
    sessionId?: string
    device?: string
    locationId?: mongoose.Types.ObjectId
    abTest?: string
    latencyMs?: number
  }
  createdAt: Date
}

const CustomerEventSchema = new Schema<ICustomerEvent>(
  {
    phoneHash: { type: String, required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    type: {
      type: String,
      enum: [
        // Core funnel
        'order_completed', 'product_view', 'cart_add',
        'reward_redeemed', 'checkout_started', 'checkout_completed',
        'menu_opened',
        // CIS internal
        'segment_changed', 'signal_detected', 'health_score_changed',
        // Behavioral — Spec v1.0
        'dish_detail_opened', 'upsell_impression', 'upsell_add',
        'checkout_field_interact', 'payment_method_selected',
        'delivery_address_set', 'loyalty_lookup',
        'tia_insight_shown', 'tia_insight_dismissed', 'tia_insight_resolved',
        'rating_submitted', 'feedback_submitted',
        'qr_promo_applied', 'order_status_changed',
      ],
      required: true,
    },
    data: {
      orderId: { type: Schema.Types.ObjectId, default: undefined },
      itemName: { type: String, default: undefined },
      itemCategory: { type: String, default: undefined },
      amount: { type: Number, default: undefined },
      rewardId: { type: String, default: undefined },
      segment: { type: String, default: undefined },
      signal: { type: String, default: undefined },
      healthScore: { type: Number, default: undefined },
      previousHealthScore: { type: Number, default: undefined },
      menuItemId: { type: Schema.Types.ObjectId, default: undefined },
      promotionId: { type: Schema.Types.ObjectId, default: undefined },
      source: { type: String, default: undefined },
      quantity: { type: Number, default: undefined },
      hasCustomizations: { type: Boolean, default: undefined },
      customizations: { type: Schema.Types.Mixed, default: undefined },
      paymentMethod: { type: String, default: undefined },
      orderMode: { type: String, default: undefined },
      previousStatus: { type: String, default: undefined },
      newStatus: { type: String, default: undefined },
      stars: { type: Number, default: undefined },
      discountAmount: { type: Number, default: undefined },
      insightType: { type: String, default: undefined },
      insightSeverity: { type: String, default: undefined },
      field: { type: String, default: undefined },
      found: { type: Boolean, default: undefined },
      points: { type: Number, default: undefined },
      redeemType: { type: String, default: undefined },
    },
    metadata: {
      source: {
        type: String,
        enum: ['order', 'posthog', 'posthog_sync', 'explore', 'loyalty', 'cron', 'manual', 'client_side'],
        required: true,
      },
      sessionId: { type: String, default: undefined },
      device: { type: String, default: undefined },
      locationId: { type: Schema.Types.ObjectId, default: undefined },
      abTest: { type: String, default: undefined },
      latencyMs: { type: Number, default: undefined },
    },
  },
  { timestamps: false }
)

// Índices
CustomerEventSchema.index({ phoneHash: 1, createdAt: -1 })
CustomerEventSchema.index({ tenantId: 1, type: 1, createdAt: -1 })
CustomerEventSchema.index({ tenantId: 1, createdAt: -1 })
CustomerEventSchema.index({ tenantId: 1, 'data.menuItemId': 1, createdAt: -1 })
CustomerEventSchema.index({ tenantId: 1, 'metadata.sessionId': 1 })

// TTL index: purgar eventos después de 2 años
CustomerEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 63072000 }) // 2 años

// HMR guard
if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).CustomerEvent
}

const CustomerEvent =
  mongoose.models.CustomerEvent ||
  mongoose.model<ICustomerEvent>('CustomerEvent', CustomerEventSchema)

export default CustomerEvent
