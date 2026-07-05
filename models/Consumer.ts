import mongoose, { Schema, Document, Types } from 'mongoose'
import crypto from 'crypto'
import { normalizeForSearch } from '@takeasygo/business'

export { normalizeForSearch }

export interface IConsumer extends Document {
  customerId: string
  name: string
  email: string
  phone: string
  phoneHash: string
  emailHash: string
  nameSearchToken: string
  tenantIds: Types.ObjectId[]
  totalOrders: number
  totalSpent: number
  firstOrderAt: Date | null
  lastOrderAt: Date | null
  isLoyaltyMember: boolean
  isCorporate: boolean
  corporateAccountId: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

const ConsumerSchema = new Schema<IConsumer>(
  {
    customerId: {
      type: String,
      unique: true,
      default: () => crypto.randomUUID(),
    },
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    phoneHash: { type: String, default: null },
    emailHash: { type: String },
    nameSearchToken: { type: String, default: '' },
    tenantIds: [{ type: Schema.Types.ObjectId, ref: 'Tenant' }],
    totalOrders: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    firstOrderAt: { type: Date, default: null },
    lastOrderAt: { type: Date, default: null },
    isLoyaltyMember: { type: Boolean, default: false },
    isCorporate: { type: Boolean, default: false },
    corporateAccountId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
)

ConsumerSchema.index({ phoneHash: 1 }, { unique: true, sparse: true })
ConsumerSchema.index(
  { emailHash: 1 },
  {
    unique: true,
    partialFilterExpression: { emailHash: { $type: 'string', $gt: '' } },
  }
)
ConsumerSchema.index({ tenantIds: 1 })
ConsumerSchema.index({ lastOrderAt: -1 })
ConsumerSchema.index({ totalSpent: -1 })
ConsumerSchema.index({ nameSearchToken: 1 })
ConsumerSchema.index({ tenantId: 1, nameSearchToken: 1 })

const Consumer =
  mongoose.models.Consumer ||
  mongoose.model<IConsumer>('Consumer', ConsumerSchema)

export default Consumer
