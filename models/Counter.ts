import mongoose, { Schema, Document } from 'mongoose'

export interface ICounter extends Document {
  tenantId: mongoose.Types.ObjectId
  seq: number
}

const CounterSchema = new Schema<ICounter>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
  seq: { type: Number, default: 0 },
})

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).Counter
}

const Counter = mongoose.models.Counter as mongoose.Model<ICounter> ||
  mongoose.model<ICounter>('Counter', CounterSchema)

export default Counter
