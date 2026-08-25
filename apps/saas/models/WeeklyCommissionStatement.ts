import mongoose, { Schema, Document, Types } from 'mongoose'

export interface IWeeklyCommissionStatement extends Document {
  tenantId: Types.ObjectId
  weekStart: Date
  weekEnd: Date
  amount: number
  status: 'pendiente' | 'pagado' | 'vencido'
  closedAt: Date
  paidAt: Date | null
  paidBy: string | null
  orderCount: number
  createdAt: Date
  updatedAt: Date
}

const WeeklyCommissionStatementSchema = new Schema<IWeeklyCommissionStatement>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    weekStart: { type: Date, required: true },
    weekEnd: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pendiente', 'pagado', 'vencido'], default: 'pendiente' },
    closedAt: { type: Date, required: true },
    paidAt: { type: Date, default: null },
    paidBy: { type: String, default: null },
    orderCount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
)

WeeklyCommissionStatementSchema.index({ tenantId: 1, weekStart: 1 }, { unique: true })

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).WeeklyCommissionStatement
}

const WeeklyCommissionStatement =
  mongoose.models.WeeklyCommissionStatement ||
  mongoose.model<IWeeklyCommissionStatement>('WeeklyCommissionStatement', WeeklyCommissionStatementSchema)

export default WeeklyCommissionStatement
