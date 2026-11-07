import mongoose, { Schema, type Document } from "mongoose"
import bcrypt from "bcryptjs"

// ============================================================================
// PosCredential — PIN del POS de un miembro de organización en una marca
// ============================================================================
// Multi-marca (D6): el PIN del POS de un empleado vive en su User y vale en
// su comercio de origen. Quien opera otras marcas del grupo por membresía
// (dueño, gerente de marca, gerente de sede…) tiene un PIN por marca acá.
//   · pin          — bcrypt (verificación final).
//   · posPinLookup — HMAC(pepper, "<tenantId>:<pin>") (business/pos-pin),
//                    el mismo cálculo que User.posPinLookup: el SaaS evita
//                    que un PIN de miembro y uno de empleado coincidan.
// El Sync solo lo usa con pos.multiBrand y org.access activos, y en cada
// login y renovación vuelve a exigir que la membresía alcance la marca.
// Misma colección que apps/saas/models/PosCredential.ts.
// ============================================================================

export interface PosCredentialDocument extends Document {
  userId: mongoose.Types.ObjectId
  tenantId: mongoose.Types.ObjectId
  pin: string
  posPinLookup: string
  createdAt: Date
  updatedAt: Date
  comparePin(candidate: string): Promise<boolean>
}

export const PosCredentialSchema = new Schema<PosCredentialDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    pin: { type: String, required: true, select: false },
    posPinLookup: { type: String, required: true, select: false },
  },
  { timestamps: true }
)

PosCredentialSchema.index({ tenantId: 1, posPinLookup: 1 }, { unique: true, name: "uniq_tenant_pin_lookup" })
PosCredentialSchema.index({ tenantId: 1, userId: 1 }, { unique: true, name: "uniq_tenant_user" })
PosCredentialSchema.index({ userId: 1 })

PosCredentialSchema.methods.comparePin = async function (candidate: string): Promise<boolean> {
  if (!this.pin) return false
  return bcrypt.compare(candidate, this.pin)
}

export const PosCredentialModel =
  (mongoose.models.PosCredential as mongoose.Model<PosCredentialDocument>) ||
  mongoose.model<PosCredentialDocument>("PosCredential", PosCredentialSchema, "pos_credentials")
