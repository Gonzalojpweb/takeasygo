import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// PointIntent — un cobro enviado a un posnet MercadoPago Point (Fase 6)
// ============================================================================
// El monto y la orden quedan del lado del server: el POS solo pregunta «¿cómo
// va el cobro X?». Nunca se acepta un monto o un estado mandado por el POS.
// ============================================================================

export type PointIntentStateValue = 'waiting' | 'approved' | 'rejected' | 'canceled' | 'error'

export interface IPointIntent extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  orderPosId: string
  deviceId: string
  intentId: string
  amountCents: number
  state: PointIntentStateValue
  paymentId: string | null
  detail: string
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

const PointIntentSchema = new Schema<IPointIntent>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
    orderPosId: { type: String, required: true, maxlength: 100 },
    deviceId: { type: String, required: true, maxlength: 120 },
    intentId: { type: String, required: true, maxlength: 120 },
    amountCents: { type: Number, required: true, min: 1 },
    state: { type: String, enum: ['waiting', 'approved', 'rejected', 'canceled', 'error'], default: 'waiting' },
    paymentId: { type: String, default: null },
    detail: { type: String, default: '', maxlength: 200 },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
)

PointIntentSchema.index({ tenantId: 1, intentId: 1 }, { unique: true })
PointIntentSchema.index({ tenantId: 1, orderPosId: 1, createdAt: -1 })

if (process.env.NODE_ENV !== 'production') {
  Reflect.deleteProperty(mongoose.models, 'PointIntent')
}

const PointIntent =
  (mongoose.models.PointIntent as mongoose.Model<IPointIntent>) ||
  mongoose.model<IPointIntent>('PointIntent', PointIntentSchema)

export default PointIntent
