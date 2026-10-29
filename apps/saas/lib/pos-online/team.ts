import mongoose from 'mongoose'
import { SAAS_TO_POS_ROLE } from '@takeasygo/business'
import User from '@/models/User'
import { resolvePosRole } from './permissions'
import type { PosContext } from './tenantContext'

// ============================================================================
// Equipo de la sede desde el POS (Fase 3, 29/10/2026)
// ============================================================================
// · El admin gestiona a todos menos a otros admins.
// · El encargado gestiona solo cajeros y mozos (no encargados ni admins).
// · Nadie se desactiva a sí mismo desde acá.
// · Un empleado creado en el POS entra con PIN; su email es técnico
//   (dominio .invalid, RFC 2606): no recibe correos ni puede loguearse con
//   email. Si necesita panel web, el admin le carga un email real en el SaaS.
// ============================================================================

/** Roles del SaaS que se ven en Equipo (los que operan el POS). */
export const TEAM_SAAS_ROLES = ['admin', 'manager', 'operations_manager', 'cashier', 'waiter', 'staff', 'host'] as const

/** Roles que se pueden crear desde el POS (en términos del SaaS). */
export const CREATABLE_ROLES = ['waiter', 'cashier', 'manager'] as const
export type CreatableRole = (typeof CREATABLE_ROLES)[number]

const MANAGER_MANAGES = new Set(['cashier', 'waiter', 'staff', 'host'])
const ADMIN_MANAGES = new Set(['manager', 'operations_manager', 'cashier', 'waiter', 'staff', 'host'])

export function canManage(actorRole: string, targetSaasRole: string): boolean {
  const actor = resolvePosRole(actorRole)
  if (actor === 'admin') return ADMIN_MANAGES.has(targetSaasRole)
  if (actor === 'manager') return MANAGER_MANAGES.has(targetSaasRole)
  return false
}

export function isTechnicalEmail(email: string | null | undefined): boolean {
  return Boolean(email && /@[^@]+\.pos\.invalid$/.test(email))
}

export function technicalEmail(tenantSlug: string): string {
  const slug = tenantSlug.toLowerCase().replace(/[^a-z0-9-]/g, '') || 'comercio'
  return `pos-${new mongoose.Types.ObjectId().toHexString()}@${slug}.pos.invalid`
}

export interface TeamUserDoc {
  _id: mongoose.Types.ObjectId
  name: string
  email?: string
  role: string
  isActive: boolean
  assignedLocations?: mongoose.Types.ObjectId[]
  posPinUpdatedAt?: Date | null
}

export function toTeamMember(u: TeamUserDoc, ctx: Pick<PosContext, 'user'>) {
  return {
    id: String(u._id),
    name: u.name,
    role: u.role,
    posRole: SAAS_TO_POS_ROLE[u.role] ?? null,
    isActive: u.isActive,
    hasPin: Boolean(u.posPinUpdatedAt),
    posPinUpdatedAt: u.posPinUpdatedAt ?? null,
    /** Sin sedes asignadas = trabaja en todas. */
    allSedes: (u.assignedLocations ?? []).length === 0,
    /** Entra al panel web con email (false = solo PIN). */
    webAccess: !isTechnicalEmail(u.email),
    isMe: String(u._id) === ctx.user.id,
    canManage: String(u._id) !== ctx.user.id && canManage(ctx.user.role, u.role),
  }
}

/** Equipo de la sede: asignados a esta sede o a todas. */
export async function listTeam(ctx: Pick<PosContext, 'tenantId' | 'locationId' | 'user'>) {
  const loc = new mongoose.Types.ObjectId(ctx.locationId)
  const users = await User.find({
    tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
    role: { $in: TEAM_SAAS_ROLES },
    $or: [{ assignedLocations: loc }, { assignedLocations: { $size: 0 } }],
  })
    .select('name email role isActive assignedLocations posPinUpdatedAt')
    .sort({ isActive: -1, name: 1 })
    .lean<TeamUserDoc[]>()
  return users.map((u) => toTeamMember(u, ctx))
}

/** Un integrante del equipo de ESTA sede (o de todas), o null. */
export async function findTeamMember(ctx: Pick<PosContext, 'tenantId' | 'locationId'>, id: string) {
  if (!mongoose.isValidObjectId(id)) return null
  const loc = new mongoose.Types.ObjectId(ctx.locationId)
  return User.findOne({
    _id: new mongoose.Types.ObjectId(id),
    tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
    role: { $in: TEAM_SAAS_ROLES },
    $or: [{ assignedLocations: loc }, { assignedLocations: { $size: 0 } }],
  })
    .select('name email role isActive assignedLocations posPinUpdatedAt')
    .lean<TeamUserDoc>()
}
