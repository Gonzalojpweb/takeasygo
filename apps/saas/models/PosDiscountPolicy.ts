import mongoose, { Schema, type Document } from 'mongoose'
import type { DiscountPolicy } from '@takeasygo/business'

// ============================================================================
// PosDiscountPolicy — política de descuentos y ajustes del POS por comercio
// ============================================================================
// Un documento por comercio (tenant). Las reglas viven en
// @takeasygo/business/discount-policy (mismo módulo en server, POS y panel).
//
// `history` guarda las versiones anteriores con desde cuándo rigieron: una
// operación hecha SIN internet se valida contra la política que regía en ese
// momento (X-Pos-Occurred-At de un equipo habilitado), no contra una más dura
// que el admin guardó después. Se conservan las últimas HISTORY_LIMIT.
//
// Sin documento ⇒ DEFAULT_DISCOUNT_POLICY (la regla de la Fase D).
// ============================================================================

export const HISTORY_LIMIT = 30

export interface DiscountPolicyHistoryEntry {
  version: number
  policy: DiscountPolicy
  validFrom: Date
  updatedBy: string | null
}

export interface IPosDiscountPolicy extends Document {
  tenantId: mongoose.Types.ObjectId
  version: number
  policy: DiscountPolicy
  updatedBy: string | null
  history: DiscountPolicyHistoryEntry[]
  createdAt: Date
  updatedAt: Date
}

const PosDiscountPolicySchema = new Schema<IPosDiscountPolicy>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    version: { type: Number, required: true, min: 1 },
    // Mixed: la forma la valida validateDiscountPolicyInput antes de guardar y
    // normalizeDiscountPolicy al leer (nunca se confía en lo guardado tal cual).
    policy: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: String, default: null },
    history: {
      type: [
        {
          _id: false,
          version: { type: Number, required: true },
          policy: { type: Schema.Types.Mixed, required: true },
          validFrom: { type: Date, required: true },
          updatedBy: { type: String, default: null },
        },
      ],
      default: [],
    },
  },
  { timestamps: true, collection: 'pos_discount_policies' }
)

PosDiscountPolicySchema.index({ tenantId: 1 }, { unique: true, name: 'uniq_tenant' })

export default (mongoose.models.PosDiscountPolicy as mongoose.Model<IPosDiscountPolicy>) ||
  mongoose.model<IPosDiscountPolicy>('PosDiscountPolicy', PosDiscountPolicySchema)
