import mongoose, { Schema, Document, Types } from 'mongoose'

export interface ICommissionSettlement extends Document {
  tenantId: Types.ObjectId
  from: Date
  to: Date
  amountCollected: number
  collectedAt: Date
  collectedBy: string
  notes?: string
  orderIds: string[]
  status: 'paid'
  createdAt: Date
  updatedAt: Date
}

const CommissionSettlementSchema = new Schema<ICommissionSettlement>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    amountCollected: { type: Number, required: true, min: 0 },
    collectedAt: { type: Date, required: true },
    collectedBy: { type: String, required: true },
    notes: { type: String },
    orderIds: { type: [String], default: [] },
    status: { type: String, enum: ['paid'], default: 'paid' },
  },
  { timestamps: true }
)

CommissionSettlementSchema.index({ tenantId: 1, from: 1, to: 1 })

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).CommissionSettlement
}

const CommissionSettlement =
  mongoose.models.CommissionSettlement ||
  mongoose.model<ICommissionSettlement>('CommissionSettlement', CommissionSettlementSchema)

export default CommissionSettlement