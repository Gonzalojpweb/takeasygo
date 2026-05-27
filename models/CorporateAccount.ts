import mongoose, { Schema, Document, Types } from 'mongoose'

export type CorporateAccountStatus = 'active' | 'suspended' | 'cancelled'
export type CorporatePaymentMode = 'cash_mp' | 'deferred' | 'mixed'
export type CorporateRegisteredBy = 'tenant' | 'superadmin'

export interface ICorporateAccount extends Document {
  tenantId: Types.ObjectId
  companyName: string
  companyTaxId: string
  status: CorporateAccountStatus
  paymentMode: CorporatePaymentMode
  paymentTerms: string
  registeredBy: CorporateRegisteredBy
  registeredById: Types.ObjectId
  companyAdminEmail: string
  employeeEmails: string[]
  notes: string
  createdAt: Date
  updatedAt: Date
}

const CorporateAccountSchema = new Schema<ICorporateAccount>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    companyName: {
      type: String,
      required: [true, 'El nombre de la empresa es obligatorio'],
      trim: true,
    },
    companyTaxId: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'cancelled'] as const,
      default: 'active',
    },
    paymentMode: {
      type: String,
      enum: ['cash_mp', 'deferred', 'mixed'] as const,
      required: [true, 'El esquema de pago es obligatorio'],
    },
    paymentTerms: {
      type: String,
      default: '',
      trim: true,
    },
    registeredBy: {
      type: String,
      enum: ['tenant', 'superadmin'] as const,
      required: true,
    },
    registeredById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    companyAdminEmail: {
      type: String,
      required: [true, 'El email de la empresa es obligatorio'],
      trim: true,
      lowercase: true,
    },
    employeeEmails: {
      type: [String],
      default: [],
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
)

CorporateAccountSchema.index({ tenantId: 1, companyAdminEmail: 1 }, { unique: true })
CorporateAccountSchema.index({ tenantId: 1, status: 1 })

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).CorporateAccount
}

const CorporateAccount = mongoose.models.CorporateAccount as mongoose.Model<ICorporateAccount>
  || mongoose.model<ICorporateAccount>('CorporateAccount', CorporateAccountSchema)

export default CorporateAccount
