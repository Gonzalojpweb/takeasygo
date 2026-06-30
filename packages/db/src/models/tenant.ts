import mongoose, { Schema, type Document } from "mongoose"

export interface TenantDocument extends Document {
  name: string
  slug: string
  config: {
    fiscalDriver: "printer" | "wsfe"
    paymentMethods: string[]
    offlineTimeout: number
    timezone: string
    currency: string
  }
  isActive: boolean
  afipCertificate?: string
  afipCertificateKey?: string
  mercadopagoAccessToken?: string
  createdAt: Date
  updatedAt: Date
}

export const TenantSchema = new Schema<TenantDocument>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    config: {
      fiscalDriver: {
        type: String,
        required: true,
        enum: ["printer", "wsfe"],
      },
      paymentMethods: [{ type: String }],
      offlineTimeout: { type: Number, default: 180 },
      timezone: { type: String, default: "America/Argentina/Buenos_Aires" },
      currency: { type: String, default: "ARS" },
    },
    isActive: { type: Boolean, default: true },
    afipCertificate: { type: String },
    afipCertificateKey: { type: String },
    mercadopagoAccessToken: { type: String },
  },
  { timestamps: true }
)

export const TenantModel = mongoose.model<TenantDocument>(
  "Tenant",
  TenantSchema,
  "sync_tenants"
)
