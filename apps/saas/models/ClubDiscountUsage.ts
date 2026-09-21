import mongoose, { Schema, Document } from 'mongoose'

export interface IClubDiscountUsage extends Document {
  tenantId: mongoose.Types.ObjectId
  phoneHash: string
  usedCount: number
  createdAt: Date
  updatedAt: Date
}

const ClubDiscountUsageSchema = new Schema<IClubDiscountUsage>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  phoneHash: { type: String, required: true },
  usedCount: { type: Number, default: 0, min: 0 },
}, { timestamps: true })

// One tracking doc per (tenant, phone) — prevents race conditions
ClubDiscountUsageSchema.index({ tenantId: 1, phoneHash: 1 }, { unique: true })

const ClubDiscountUsage = mongoose.models.ClubDiscountUsage
  || mongoose.model<IClubDiscountUsage>('ClubDiscountUsage', ClubDiscountUsageSchema)

export default ClubDiscountUsage
