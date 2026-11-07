import mongoose, { Schema, Types } from 'mongoose'
import { ORG_ROLES, type OrgRole, type OrgScope } from './OrgMembership'

// ============================================================================
// OrgInvitation — invitación por email a una organización (multi-marca PR 7)
// ============================================================================
// El token solo viaja en el email; acá se guarda su SHA-256 (mismo patrón que
// el onboarding: randomBytes(32) + SHA-256). Vence a los 7 días. La
// aceptación (PR 9) exige que el email de la sesión coincida.
// ============================================================================

export const INVITATION_STATUSES = ['pending', 'accepted', 'expired', 'cancelled'] as const
export type InvitationStatus = (typeof INVITATION_STATUSES)[number]

export const INVITATION_TTL_MS = 7 * 24 * 3600 * 1000

export interface IOrgInvitation {
  _id: Types.ObjectId
  organizationId: Types.ObjectId
  email: string
  orgRole: OrgRole
  scope: OrgScope
  tenantRole: 'admin' | 'manager' | null
  tokenHash: string
  expiresAt: Date
  status: InvitationStatus
  invitedBy: Types.ObjectId
  acceptedBy: Types.ObjectId | null
  acceptedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const OrgInvitationSchema = new Schema<IOrgInvitation>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 200 },
    orgRole: { type: String, enum: ORG_ROLES, required: true },
    scope: {
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
    tenantRole: { type: String, enum: ['admin', 'manager', null], default: null },
    tokenHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    expiresAt: { type: Date, required: true, default: () => new Date(Date.now() + INVITATION_TTL_MS) },
    status: { type: String, enum: INVITATION_STATUSES, default: 'pending' },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    acceptedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'org_invitations' }
)

OrgInvitationSchema.index({ tokenHash: 1 }, { unique: true })
OrgInvitationSchema.index({ organizationId: 1, email: 1, status: 1 })
// Limpieza: se borra 30 días después de vencer.
OrgInvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 })

export default (mongoose.models.OrgInvitation as mongoose.Model<IOrgInvitation>) ||
  mongoose.model<IOrgInvitation>('OrgInvitation', OrgInvitationSchema)
