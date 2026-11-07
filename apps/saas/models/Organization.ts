import mongoose, { Schema, Types } from 'mongoose'

// ============================================================================
// Organization — agrupación administrativa de marcas (multi-marca PR 7)
// ============================================================================
// Organización → Marcas (Tenant) → Sedes (Location). Es solo agrupación: el
// Tenant sigue siendo la marca y la unidad fiscal, de plan, carta y club.
// Se crea SOLO cuando un cliente agrupa marcas (D1): no hay organizaciones
// «de uno». En la Fase 1 solo el superadmin la crea y vincula marcas (D7).
// PR 7 declara el modelo; ningún flujo lo usa todavía.
// ============================================================================

export const ORG_STATUSES = ['active', 'suspended', 'deleted'] as const
export type OrgStatus = (typeof ORG_STATUSES)[number]

export interface IOrganization {
  _id: Types.ObjectId
  name: string
  /** Namespace propio: /grupo/{slug}. Independiente del slug de los comercios. */
  slug: string
  status: OrgStatus
  /** Propietario vigente (desnormalizado; la verdad es OrgMembership.orgRole = 'owner'). */
  ownerUserId: Types.ObjectId
  /** Dato interno libre. No fiscal (FiscalEntity es Fase 3). */
  legalNote: string | null
  createdBy: Types.ObjectId
  // Reservados para fases siguientes (se declaran ahora para no migrar después)
  billing: { mode: 'per_tenant' | 'organization'; plan: string | null }
  policies: Record<string, unknown>
  limits: { maxTenants: number | null; maxMembers: number | null }
  /** Sube ante cualquier cambio de membresías (invalida cachés de la proyección, PR 8). */
  membershipsVersion: number
  createdAt: Date
  updatedAt: Date
}

const OrganizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    slug: {
      type: String, required: true, lowercase: true, trim: true,
      match: [/^[a-z0-9-]{2,50}$/, 'Slug inválido — solo minúsculas, números y guiones'],
    },
    status: { type: String, enum: ORG_STATUSES, default: 'active' },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    legalNote: { type: String, default: null, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    billing: {
      mode: { type: String, enum: ['per_tenant', 'organization'], default: 'per_tenant' },
      plan: { type: String, default: null },
    },
    policies: { type: Schema.Types.Mixed, default: {} },
    limits: {
      maxTenants: { type: Number, default: null, min: 0 },
      maxMembers: { type: Number, default: null, min: 0 },
    },
    membershipsVersion: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, collection: 'organizations' }
)

OrganizationSchema.index({ slug: 1 }, { unique: true })
OrganizationSchema.index({ ownerUserId: 1 })
OrganizationSchema.index({ status: 1 })

export default (mongoose.models.Organization as mongoose.Model<IOrganization>) ||
  mongoose.model<IOrganization>('Organization', OrganizationSchema)
