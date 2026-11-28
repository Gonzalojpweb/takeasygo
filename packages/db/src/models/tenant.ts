import mongoose, { Schema, type Document } from "mongoose"

export interface TenantDocument extends Document {
  name: string
  slug: string
  plan: "trial" | "try" | "buy" | "full" | "anfitrion"
  config: {
    fiscalDriver: "printer" | "wsfe"
    paymentMethods: string[]
    offlineTimeout: number
    timezone: string
    currency: string
  }
  isActive: boolean
  /** Mitad y mitad: regla de cobro del comercio (la escribe el SaaS; acá solo se lee). */
  halfAndHalf?: { pricing?: "max" | "average" | "half_sum" }
  createdAt: Date
  updatedAt: Date
}

export const TenantSchema = new Schema<TenantDocument>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    plan: {
      type: String,
      enum: ["trial", "try", "buy", "full", "anfitrion"],
      default: "trial",
    },
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
    // Mitad y mitad (lo configura el comercio en el SaaS). Sin dato = 'max'.
    halfAndHalf: {
      type: {
        _id: false,
        pricing: { type: String, enum: ["max", "average", "half_sum"], default: "max" },
      },
      default: undefined,
    },
    // Informe de caja X5 (2026-10-29): se quitaron afipCertificate,
    // afipCertificateKey y mercadopagoAccessToken — eran secretos en texto
    // plano que nadie usa. El certificado de ARCA vive cifrado (AES-256-GCM,
    // select:false) en el FiscalProfile del SaaS; MercadoPago, en el SaaS.
    // Con el esquema estricto de Mongoose ya no se pueden volver a guardar.
  },
  { timestamps: true }
)

export const TenantModel =
  (mongoose.models.Tenant as mongoose.Model<TenantDocument>) ||
  mongoose.model<TenantDocument>("Tenant", TenantSchema, "sync_tenants")
