import mongoose, { Schema, Document, Types } from 'mongoose'

/**
 * Rol por sede (Oleada 2 multisede — user_location_roles).
 *
 * Una fila por (tenant, user, sede). `locationId: null` = el rol aplica a
 * todo el tenant (usuarios single-sede legacy / roles de tenant).
 * superadmin queda fuera del modelo (acceso total por diseño) y
 * consumer no es un rol de sede.
 */
export type LocationRole = 'admin' | 'manager' | 'operations_manager' | 'kitchen_lead' | 'staff' | 'cashier' | 'waiter' | 'host' | 'auditor' | 'seller'

export const LOCATION_ROLES: LocationRole[] = [
  'admin',
  'manager',
  'operations_manager',
  'kitchen_lead',
  'staff',
  'cashier',
  'waiter',
  'host',
  'auditor',
  'seller',
]

export interface IUserLocationRole extends Document {
  tenantId: Types.ObjectId
  userId: Types.ObjectId
  locationId: Types.ObjectId | null
  role: LocationRole
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const UserLocationRoleSchema = new Schema<IUserLocationRole>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      default: null,
    },
    role: {
      type: String,
      enum: LOCATION_ROLES,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
)

// Una fila por combinación (tenant, user, sede); null = tenant-wide.
UserLocationRoleSchema.index({ tenantId: 1, userId: 1, locationId: 1 }, { unique: true })

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).UserLocationRole
}

const UserLocationRole =
  (mongoose.models.UserLocationRole as mongoose.Model<IUserLocationRole>) ||
  // 3er arg FORZADO: sin él mongoose usaría `userlocationroles` (plural
  // por defecto) y las filas reales del backfill (`user_location_roles`,
  // ver scripts/audit/user-location-roles-apply.mjs) quedarían invisibles
  // para la app: el flag rbac.sedeScope caería siempre al fallback legacy.
  mongoose.model<IUserLocationRole>('UserLocationRole', UserLocationRoleSchema, 'user_location_roles')

export default UserLocationRole
