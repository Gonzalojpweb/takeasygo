import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// MpSplitLink — link de un solo uso para que el restaurante autorice el split
// ============================================================================
// Lo genera el superadmin. El dueño del restaurante lo abre, inicia sesión
// en SU cuenta de MercadoPago y acepta: no necesita entrar al panel.
// · Solo se guarda el HASH del token (si se filtra la base, los links no
//   sirven). El token en claro se muestra una sola vez al superadmin.
// · Vence a las 48 h y se usa una vez (usedAt). Si el canje con MP falla,
//   se libera para reintentar.
// ============================================================================

export interface IMpSplitLink extends Document {
  tenantId: mongoose.Types.ObjectId
  /** Cuenta de mpAccounts a conectar (null = la activa / legacy). */
  accountId: string | null
  tokenHash: string
  expiresAt: Date
  usedAt: Date | null
  createdBy: string
  createdAt: Date
}

const MpSplitLinkSchema = new Schema<IMpSplitLink>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    accountId: { type: String, default: null },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    createdBy: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

// Limpieza automática una semana después de vencer.
MpSplitLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 86_400 })

const MpSplitLink =
  (mongoose.models.MpSplitLink as mongoose.Model<IMpSplitLink>) ||
  mongoose.model<IMpSplitLink>('MpSplitLink', MpSplitLinkSchema)

export default MpSplitLink
