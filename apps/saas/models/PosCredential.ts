import mongoose, { Schema, type Document } from 'mongoose'

// PIN del POS de un miembro de organización en una marca (multi-marca D6).
// Misma colección y esquema que packages/db/src/models/pos-credential.ts,
// que usa el Sync para el login. Lo emite lib/pos-online/pinIssue.ts.

export interface IPosCredential extends Document {
  userId: mongoose.Types.ObjectId
  tenantId: mongoose.Types.ObjectId
  pin: string
  posPinLookup: string
  createdAt: Date
  updatedAt: Date
}

const PosCredentialSchema = new Schema<IPosCredential>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    pin: { type: String, required: true, select: false },
    posPinLookup: { type: String, required: true, select: false },
  },
  { timestamps: true, collection: 'pos_credentials' }
)

PosCredentialSchema.index({ tenantId: 1, posPinLookup: 1 }, { unique: true, name: 'uniq_tenant_pin_lookup' })
PosCredentialSchema.index({ tenantId: 1, userId: 1 }, { unique: true, name: 'uniq_tenant_user' })
PosCredentialSchema.index({ userId: 1 })

export default (mongoose.models.PosCredential as mongoose.Model<IPosCredential>) ||
  mongoose.model<IPosCredential>('PosCredential', PosCredentialSchema)
