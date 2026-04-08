import mongoose, { Schema, Document } from 'mongoose'

export interface IPaymentNotification extends Document {
  mpId: string
  topic: string
  tenantId: mongoose.Types.ObjectId
  processed: boolean
  processedAt?: Date
  orderId?: mongoose.Types.ObjectId
  reservationId?: mongoose.Types.ObjectId
  payload: any
  error?: string
  createdAt: Date
  updatedAt: Date
}

const PaymentNotificationSchema = new Schema<IPaymentNotification>(
  {
    mpId: {
      type: String,
      required: true,
      index: true,
    },
    topic: {
      type: String,
      required: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    processed: {
      type: Boolean,
      default: false,
      index: true,
    },
    processedAt: {
      type: Date,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
    },
    reservationId: {
      type: Schema.Types.ObjectId,
      ref: 'Reservation',
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    error: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
)

// Índice único compuesto para evitar duplicados a nivel de DB
PaymentNotificationSchema.index({ mpId: 1, tenantId: 1 }, { unique: true })

const PaymentNotification =
  mongoose.models.PaymentNotification ||
  mongoose.model<IPaymentNotification>('PaymentNotification', PaymentNotificationSchema)

export default PaymentNotification
