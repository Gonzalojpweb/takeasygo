import mongoose, { Schema, Document } from 'mongoose'

export type FeedbackEvent =
  | 'checkout_success'
  | 'checkout_error'
  | 'checkout_abandoned'
  | 'club_registered'
  | 'redeem_completed'
  | 'geofence_notified'

export interface IFeedback extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId?: mongoose.Types.ObjectId
  orderId?: string
  event: FeedbackEvent
  satisfaction?: 'excelente' | 'buena' | 'mejorable'
  errorType?: 'pago_rechazado' | 'pantalla_trabada' | 'precio_incorrecto' | 'metodo_pago_no_encontrado' | 'otro'
  errorDetail?: string
  understoodPoints?: boolean
  wasEasy?: boolean
  wasUseful?: boolean | 'no_recuerda'
  comment?: string
  metadata?: Record<string, any>
  /** Phone hash del cliente (para rate limiting por usuario) */
  clientHash?: string
  createdAt: Date
}

const FeedbackSchema = new Schema<IFeedback>({
  tenantId:   { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', index: true },
  orderId:    { type: String, index: true },
  event:      { type: String, required: true, enum: ['checkout_success','checkout_error','checkout_abandoned','club_registered','redeem_completed','geofence_notified'] },
  satisfaction:    { type: String, enum: ['excelente','buena','mejorable'] },
  errorType:       { type: String, enum: ['pago_rechazado','pantalla_trabada','precio_incorrecto','metodo_pago_no_encontrado','otro'] },
  errorDetail:     { type: String },
  understoodPoints:{ type: Boolean },
  wasEasy:         { type: Boolean },
  wasUseful:       { type: Schema.Types.Mixed },
  comment:         { type: String, maxlength: 500 },
  metadata:        { type: Schema.Types.Mixed },
  clientHash:      { type: String, index: true },
  createdAt:       { type: Date, default: Date.now },
})

export default mongoose.models.Feedback || mongoose.model<IFeedback>('Feedback', FeedbackSchema)
