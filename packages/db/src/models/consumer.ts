import mongoose, { Schema, type Document } from "mongoose"

/**
 * Modelo de solo lectura para el Sync Layer.
 * Apunta a la colección `consumers` del SaaS (misma MongoDB).
 * Los campos name, email, phone están encriptados — NO descifrar en el sync layer.
 */
export interface ConsumerDocument extends Document {
  customerId: string
  name: string          // encriptado
  email: string         // encriptado
  phone: string         // encriptado
  phoneHash: string
  emailHash: string
  nameSearchToken: string  // en claro — hash de búsqueda, no dato sensible
  tenantIds: mongoose.Types.ObjectId[]
  totalOrders: number
  totalSpent: number
  firstOrderAt: Date | null
  lastOrderAt: Date | null
  isLoyaltyMember: boolean
  isCorporate: boolean
  corporateAccountId: mongoose.Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

export const ConsumerSchema = new Schema<ConsumerDocument>(
  {
    customerId: { type: String, unique: true, sparse: true },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    phoneHash: { type: String, default: null },
    emailHash: { type: String, default: "" },
    nameSearchToken: { type: String, default: "" },
    tenantIds: [{ type: Schema.Types.ObjectId, ref: "Tenant" }],
    totalOrders: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    firstOrderAt: { type: Date, default: null },
    lastOrderAt: { type: Date, default: null },
    isLoyaltyMember: { type: Boolean, default: false },
    isCorporate: { type: Boolean, default: false },
    corporateAccountId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true, strict: false }
)

ConsumerSchema.index({ customerId: 1 }, { sparse: true })
ConsumerSchema.index({ phoneHash: 1 }, { sparse: true })
ConsumerSchema.index({ nameSearchToken: 1 })
ConsumerSchema.index({ tenantIds: 1 })
ConsumerSchema.index({ lastOrderAt: -1 })
ConsumerSchema.index({ totalSpent: -1 })

export const ConsumerModel = mongoose.model<ConsumerDocument>(
  "Consumer",
  ConsumerSchema,
  "consumers"
)
