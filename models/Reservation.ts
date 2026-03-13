import mongoose, { Schema, Document } from 'mongoose'

export interface IReservation extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  reservationNumber: string
  date: string        // "2024-03-15"
  time: string        // "13:00"
  partySize: number
  name: string
  phone: string
  notes: string
  status: 'pending_payment' | 'confirmed' | 'cancelled' | 'seated' | 'no_show'
  payment: {
    amount: number
    status: 'pending' | 'approved' | 'rejected'
    mercadopagoId: string | null
    preferenceId: string | null
  }
  createdAt: Date
  updatedAt: Date
}

const ReservationSchema = new Schema<IReservation>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
    reservationNumber: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    partySize: { type: Number, required: true, min: 1 },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    notes: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['pending_payment', 'confirmed', 'cancelled', 'seated', 'no_show'],
      default: 'pending_payment',
    },
    payment: {
      amount: { type: Number, default: 0 },
      status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
      mercadopagoId: { type: String, default: null },
      preferenceId: { type: String, default: null },
    },
  },
  { timestamps: true }
)

ReservationSchema.index({ tenantId: 1, date: 1 })

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).Reservation
}

const Reservation = mongoose.models.Reservation as mongoose.Model<IReservation> ||
  mongoose.model<IReservation>('Reservation', ReservationSchema)

export default Reservation
