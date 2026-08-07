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
  }
  metadata: {
    source: 'order' | 'posthog' | 'explore' | 'loyalty' | 'cron' | 'manual'
    sessionId?: string
    device?: string
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
        'order_completed', 'product_view', 'cart_add',
        'reward_redeemed', 'checkout_started', 'checkout_completed',
        'menu_opened', 'segment_changed', 'signal_detected',
        'health_score_changed',
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
    },
    metadata: {
      source: {
        type: String,
        enum: ['order', 'posthog', 'explore', 'loyalty', 'cron', 'manual'],
        required: true,
      },
      sessionId: { type: String, default: undefined },
      device: { type: String, default: undefined },
    },
  },
  { timestamps: false }
)

// Índices
CustomerEventSchema.index({ phoneHash: 1, createdAt: -1 })
CustomerEventSchema.index({ tenantId: 1, type: 1, createdAt: -1 })
CustomerEventSchema.index({ tenantId: 1, createdAt: -1 })

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
