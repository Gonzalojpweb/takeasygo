import mongoose, { Schema } from 'mongoose'

// ============================================================================
// AccessShadowEvent — divergencias del modo sombra de `access.central`
// ============================================================================
// Multi-marca, PR 2 (06/11/2026). Con el interruptor en `log`, cada guardia
// migrada calcula la decisión vieja (claims del JWT, congelados hasta 8 h) y
// la nueva (usuario leído de la base). Si difieren se guarda un evento acá y
// se aplica la VIEJA. Sirve para medir antes de pasar a `enforce`.
// No guarda datos personales: ids, rol y motivo. Se borra sola a los 30 días.
// ============================================================================

// org_membership (PR 8): con org.access en `log`, una membresía habría dado
// acceso a un comercio que el usuario no tiene por origen.
export type ShadowReason = 'jwt_stale_role' | 'jwt_stale_tenant' | 'user_inactive' | 'no_jwt' | 'org_membership' | 'unknown'

export interface IAccessShadowEvent {
  family: string
  route: string | null
  userId: string | null
  tenantId: string | null
  oldDecision: boolean
  newDecision: boolean
  oldRole: string | null
  newRole: string | null
  reason: ShadowReason
  createdAt: Date
}

const AccessShadowEventSchema = new Schema<IAccessShadowEvent>(
  {
    family: { type: String, required: true, maxlength: 60 },
    route: { type: String, default: null, maxlength: 200 },
    userId: { type: String, default: null },
    tenantId: { type: String, default: null },
    oldDecision: { type: Boolean, required: true },
    newDecision: { type: Boolean, required: true },
    oldRole: { type: String, default: null },
    newRole: { type: String, default: null },
    reason: { type: String, enum: ['jwt_stale_role', 'jwt_stale_tenant', 'user_inactive', 'no_jwt', 'org_membership', 'unknown'], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'access_shadow_events' }
)

AccessShadowEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 })
AccessShadowEventSchema.index({ family: 1, reason: 1, createdAt: -1 })

export default (mongoose.models.AccessShadowEvent as mongoose.Model<IAccessShadowEvent>) ||
  mongoose.model<IAccessShadowEvent>('AccessShadowEvent', AccessShadowEventSchema)
