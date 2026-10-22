import mongoose, { Schema, Document, Types } from 'mongoose'

// ============================================================================
// CommissionPaymentIntent — un pago de comisiones a TakeasyGO por MercadoPago
// ============================================================================
// Al tocar «Pagar» se congela QUÉ se paga: los pedidos exactos (transferencia
// delivery) y el monto. El webhook de MP salda exactamente esos pedidos (no
// "lo que haya en el rango" al momento de llegar el aviso) y marca pagadas
// las semanas que quedan cubiertas. external_reference = commission-intent:<_id>.
// ============================================================================

export interface ICommissionPaymentIntent extends Document {
  tenantId: Types.ObjectId
  /** Pedidos que cubre este pago (ids de Order). */
  orderIds: string[]
  /** Lunes (inicio) de cada semana incluida. */
  weekStarts: Date[]
  /** @storedAs cents */
  amount: number
  status: 'pending' | 'paid' | 'superseded'
  preferenceId: string | null
  mpPaymentId: string | null
  /** Monto que efectivamente acreditó MP. @storedAs cents */
  paidAmount: number | null
  paidAt: Date | null
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

const CommissionPaymentIntentSchema = new Schema<ICommissionPaymentIntent>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    orderIds: { type: [String], required: true },
    weekStarts: { type: [Date], default: [] },
    amount: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['pending', 'paid', 'superseded'], default: 'pending' },
    preferenceId: { type: String, default: null },
    mpPaymentId: { type: String, default: null },
    paidAmount: { type: Number, default: null },
    paidAt: { type: Date, default: null },
    createdBy: { type: String, default: null },
  },
  { timestamps: true },
)

CommissionPaymentIntentSchema.index({ tenantId: 1, createdAt: -1 })
// Un pago de MP salda a lo sumo una intención.
CommissionPaymentIntentSchema.index({ mpPaymentId: 1 }, { unique: true, partialFilterExpression: { mpPaymentId: { $type: 'string' } } })

const CommissionPaymentIntent =
  (mongoose.models.CommissionPaymentIntent as mongoose.Model<ICommissionPaymentIntent>) ||
  mongoose.model<ICommissionPaymentIntent>('CommissionPaymentIntent', CommissionPaymentIntentSchema)
export default CommissionPaymentIntent
