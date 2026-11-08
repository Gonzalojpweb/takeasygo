import mongoose, { Schema, Types } from 'mongoose'

// ============================================================================
// OrgMembership — quién accede a qué marcas/sedes de una organización (PR 7)
// ============================================================================
// No crea una segunda matriz de permisos: cada membresía se traduce, por
// marca, a un LocationRole existente (ver ORG_ROLE_TO_LOCATION_ROLE en
// lib/organizations/membership-rules.ts). La proyección llega en el PR 8.
// Las reglas de dominio (rol ↔ alcance, último owner, privilegios) viven en
// el servicio, no solo en el esquema.
// ============================================================================

export const ORG_ROLES = ['owner', 'org_admin', 'brand_manager', 'location_manager', 'operations', 'accountant'] as const
export type OrgRole = (typeof ORG_ROLES)[number]

export const MEMBERSHIP_STATUSES = ['active', 'suspended', 'revoked'] as const
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number]

export interface OrgScope {
  /** true: todas las marcas de la organización, incluidas las futuras. */
  allTenants: boolean
  /** Marcas alcanzadas si !allTenants. */
  tenantIds: Types.ObjectId[]
  /** Roles de sede (location_manager / operations). */
  locations: { tenantId: Types.ObjectId; locationId: Types.ObjectId }[]
}

export interface IOrgMembership {
  _id: Types.ObjectId
  organizationId: Types.ObjectId
  userId: Types.ObjectId
  orgRole: OrgRole
  status: MembershipStatus
  scope: OrgScope
  /** Rol efectivo en la marca para brand_manager (D2: 'manager' por defecto). */
  tenantRole: 'admin' | 'manager' | null
  /** Módulos visibles en el panel de grupo (Fase 2+). */
  modules: string[]
  /** Quién otorgó (null: proceso del sistema). */
  grantedBy: Types.ObjectId | null
  grantedAt: Date
  revokedAt: Date | null
  revokedBy: Types.ObjectId | null
  revokeReason: string | null
  /**
   * Resumen semanal del grupo por email (lunes, vista 360). Sin dato = prendido
   * para quien ve los números. lastSentWeek = lunes de la semana enviada
   * (YYYY-MM-DD), para no mandarlo dos veces.
   */
  weeklySummary?: { enabled?: boolean | null; lastSentWeek?: string | null } | null
  createdAt: Date
  updatedAt: Date
}

const ScopeSchema = new Schema<OrgScope>(
  {
    allTenants: { type: Boolean, default: false },
    tenantIds: { type: [Schema.Types.ObjectId], ref: 'Tenant', default: [] },
    locations: {
      type: [{
        _id: false,
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
        locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
      }],
      default: [],
    },
  },
  { _id: false }
)

const OrgMembershipSchema = new Schema<IOrgMembership>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orgRole: { type: String, enum: ORG_ROLES, required: true },
    status: { type: String, enum: MEMBERSHIP_STATUSES, default: 'active' },
    scope: { type: ScopeSchema, default: () => ({}) },
    tenantRole: { type: String, enum: ['admin', 'manager', null], default: null },
    modules: { type: [String], default: [] },
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    grantedAt: { type: Date, default: () => new Date() },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revokeReason: { type: String, default: null, maxlength: 300 },
    weeklySummary: {
      type: new Schema({ enabled: { type: Boolean, default: undefined }, lastSentWeek: { type: String, default: null } }, { _id: false }),
      default: undefined,
    },
  },
  { timestamps: true, collection: 'org_memberships' }
)

// Una membresía por persona y organización: para cambiar el rol se edita.
OrgMembershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true })
// La proyección (PR 8) consulta por usuario en cada request (con caché).
OrgMembershipSchema.index({ userId: 1, status: 1 })
// Listados y regla «al menos un owner».
OrgMembershipSchema.index({ organizationId: 1, orgRole: 1, status: 1 })
// Al desvincular una marca, encontrar las membresías afectadas.
OrgMembershipSchema.index({ 'scope.tenantIds': 1 })

export default (mongoose.models.OrgMembership as mongoose.Model<IOrgMembership>) ||
  mongoose.model<IOrgMembership>('OrgMembership', OrgMembershipSchema)
