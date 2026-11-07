/**
 * lib/organizations/service.ts — operaciones de organización (multi-marca PR 9a)
 *
 * Diseño §8.2. Toda la lógica vive acá y las rutas solo la llaman: así las
 * reglas se prueban sin HTTP. Cada operación:
 *   · valida con las reglas puras (membership-rules) y contra la base (scope-check);
 *   · usa escrituras condicionales (sin transacciones: las pruebas corren sobre
 *     un Mongo sin réplica) y es idempotente ante reintentos;
 *   · sube `membershipsVersion` si cambia quién accede a qué (invalida la
 *     caché de la proyección en todas las instancias, ≤ 20 s);
 *   · deja AuditLog con organizationId y tenantId null (acción `org.*`).
 *
 * Fase 1: solo el superadmin crea organizaciones, vincula marcas y gestiona
 * miembros (D7). La aceptación de invitaciones la hace la persona invitada.
 */
import crypto from 'crypto'
import { Types } from 'mongoose'
import Organization from '@/models/Organization'
import OrgMembership, { ORG_ROLES, MEMBERSHIP_STATUSES, type OrgRole } from '@/models/OrgMembership'
import OrgInvitation from '@/models/OrgInvitation'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import AuditLog from '@/models/AuditLog'
import { orgSlugError } from '@/lib/reserved-slugs'
import {
  validateRoleScope, checkLastOwner, checkEligibleUser, checkPrivilege, type ScopeInput, type Actor,
} from './membership-rules'
import { checkScopeWithinOrg } from './scope-check'
import { clearProjectionCaches } from './projection'

// ── Errores y actor ───────────────────────────────────────────────────────────

export class OrgError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message)
  }
}

/** Quién hace la operación (para auditoría). */
export interface AuditActor {
  userId: string | null
  name: string
  role: string
}

const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v)
const toId = (v: string) => new Types.ObjectId(v)
const idOrNull = (v: string | null | undefined) => (isId(v) ? toId(v) : null)

async function audit(organizationId: Types.ObjectId | string, actor: AuditActor, action: string, entity: string, entityId: string | null, details: Record<string, unknown>) {
  try {
    await AuditLog.create({
      tenantId: null,
      organizationId,
      userId: idOrNull(actor.userId),
      userName: actor.name,
      userRole: actor.role,
      action,
      entity,
      entityId,
      details,
    })
  } catch (err) {
    console.warn('[org-audit] no se pudo registrar:', (err as Error)?.message)
  }
}

async function bumpVersion(orgId: Types.ObjectId | string) {
  await Organization.updateOne({ _id: orgId }, { $inc: { membershipsVersion: 1 } })
  clearProjectionCaches() // en esta instancia, al instante
}

async function loadOrg(orgId: string) {
  if (!isId(orgId)) throw new OrgError(404, 'org_not_found', 'Organización no encontrada')
  const org = await Organization.findOne({ _id: orgId, status: { $ne: 'deleted' } })
  if (!org) throw new OrgError(404, 'org_not_found', 'Organización no encontrada')
  return org
}

// ── Entrada: alcance ──────────────────────────────────────────────────────────

export interface ScopeBody {
  allTenants?: unknown
  tenantIds?: unknown
  locations?: unknown
}

/** Normaliza el alcance que llega del cliente. Ids inválidos → 400. */
export function parseScope(raw: ScopeBody | null | undefined): ScopeInput {
  const tenantIds = Array.isArray(raw?.tenantIds) ? raw!.tenantIds.map(String) : []
  const locations = Array.isArray(raw?.locations)
    ? (raw!.locations as { tenantId?: unknown; locationId?: unknown }[]).map(l => ({ tenantId: String(l?.tenantId ?? ''), locationId: String(l?.locationId ?? '') }))
    : []
  if (![...tenantIds, ...locations.flatMap(l => [l.tenantId, l.locationId])].every(isId)) {
    throw new OrgError(400, 'invalid_scope', 'Hay identificadores inválidos en el alcance.')
  }
  return { allTenants: raw?.allTenants === true, tenantIds, locations }
}

function parseRole(raw: unknown): OrgRole {
  if (typeof raw !== 'string' || !(ORG_ROLES as readonly string[]).includes(raw)) {
    throw new OrgError(400, 'invalid_role', 'Rol de organización inválido.')
  }
  return raw as OrgRole
}

function parseTenantRole(raw: unknown): 'admin' | 'manager' | null {
  if (raw === undefined || raw === null || raw === '') return null
  if (raw === 'admin' || raw === 'manager') return raw
  throw new OrgError(400, 'invalid_tenant_role', 'El rol en la marca debe ser admin o manager.')
}

async function assertValidGrant(orgId: string, orgRole: OrgRole, scope: ScopeInput, tenantRole: 'admin' | 'manager' | null) {
  const ruleErr = validateRoleScope(orgRole, scope, tenantRole)
  if (ruleErr) throw new OrgError(400, ruleErr.code, ruleErr.message)
  const scopeErr = await checkScopeWithinOrg(orgId, scope)
  if (scopeErr) throw new OrgError(400, scopeErr.code, scopeErr.message, scopeErr)
}

const SUPERADMIN: Actor = { kind: 'superadmin' }

function toScopeDoc(scope: ScopeInput) {
  return {
    allTenants: scope.allTenants,
    tenantIds: scope.tenantIds.map(toId),
    locations: scope.locations.map(l => ({ tenantId: toId(l.tenantId), locationId: toId(l.locationId) })),
  }
}

function scopeFromDoc(s: { allTenants?: boolean; tenantIds?: unknown[]; locations?: { tenantId: unknown; locationId: unknown }[] } | undefined): ScopeInput {
  return {
    allTenants: Boolean(s?.allTenants),
    tenantIds: (s?.tenantIds ?? []).map(String),
    locations: (s?.locations ?? []).map(l => ({ tenantId: String(l.tenantId), locationId: String(l.locationId) })),
  }
}

// ── Organizaciones ────────────────────────────────────────────────────────────

export async function createOrganization(input: { name?: unknown; slug?: unknown; legalNote?: unknown }, actor: AuditActor) {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (name.length < 2 || name.length > 100) throw new OrgError(400, 'invalid_name', 'El nombre debe tener entre 2 y 100 caracteres.')
  const slug = typeof input.slug === 'string' ? input.slug.trim().toLowerCase() : ''
  const slugErr = orgSlugError(slug)
  if (slugErr) throw new OrgError(400, 'invalid_slug', slugErr)
  if (await Organization.exists({ slug })) throw new OrgError(409, 'slug_taken', 'Ese enlace de organización ya está en uso.')
  try {
    const org = await Organization.create({
      name, slug, createdBy: idOrNull(actor.userId),
      legalNote: typeof input.legalNote === 'string' ? input.legalNote.slice(0, 500) : null,
    })
    await audit(org._id, actor, 'org.created', 'organization', String(org._id), { name, slug })
    return org
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) throw new OrgError(409, 'slug_taken', 'Ese enlace de organización ya está en uso.')
    throw err
  }
}

export async function updateOrganization(orgId: string, input: { name?: unknown; status?: unknown; legalNote?: unknown }, actor: AuditActor) {
  const org = await loadOrg(orgId)
  const set: Record<string, unknown> = {}
  if (input.name !== undefined) {
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (name.length < 2 || name.length > 100) throw new OrgError(400, 'invalid_name', 'El nombre debe tener entre 2 y 100 caracteres.')
    set.name = name
  }
  if (input.status !== undefined) {
    if (input.status !== 'active' && input.status !== 'suspended') throw new OrgError(400, 'invalid_status', 'El estado debe ser active o suspended.')
    set.status = input.status
  }
  if (input.legalNote !== undefined) set.legalNote = typeof input.legalNote === 'string' ? input.legalNote.slice(0, 500) : null
  if (!Object.keys(set).length) return org
  const before = { name: org.name, status: org.status }
  await Organization.updateOne({ _id: org._id }, { $set: set })
  if (set.status !== undefined && set.status !== org.status) await bumpVersion(org._id) // suspender corta membresías
  await audit(org._id, actor, 'org.updated', 'organization', String(org._id), { before, after: set })
  return Organization.findById(org._id)
}

// ── Vincular / desvincular marcas ─────────────────────────────────────────────

export interface LinkPreviewRow {
  tenantId: string
  name: string | null
  slug: string | null
  status: 'ok' | 'not_found' | 'deleted' | 'already_linked' | 'other_org'
}

export async function previewLink(orgId: string, tenantIds: unknown): Promise<LinkPreviewRow[]> {
  const org = await loadOrg(orgId)
  const ids = Array.isArray(tenantIds) ? [...new Set(tenantIds.map(String))] : []
  if (!ids.length || !ids.every(isId)) throw new OrgError(400, 'invalid_tenants', 'Indicá marcas válidas.')
  const docs = await Tenant.find({ _id: { $in: ids } }).select('_id name slug status organizationId')
    .lean<{ _id: unknown; name: string; slug: string; status?: string; organizationId?: unknown }[]>()
  const byId = new Map(docs.map(d => [String(d._id), d]))
  return ids.map(id => {
    const t = byId.get(id)
    if (!t) return { tenantId: id, name: null, slug: null, status: 'not_found' as const }
    const base = { tenantId: id, name: t.name, slug: t.slug }
    if (t.status === 'deleted') return { ...base, status: 'deleted' as const }
    if (t.organizationId && String(t.organizationId) === String(org._id)) return { ...base, status: 'already_linked' as const }
    if (t.organizationId) return { ...base, status: 'other_org' as const }
    return { ...base, status: 'ok' as const }
  })
}

/**
 * Vincula marcas independientes. Escritura condicional por marca: si otro
 * proceso la vinculó primero, queda en `conflicts` y no se pisa.
 */
export async function linkTenants(orgId: string, tenantIds: unknown, actor: AuditActor) {
  const org = await loadOrg(orgId)
  const preview = await previewLink(orgId, tenantIds)
  const linked: string[] = []
  const conflicts: LinkPreviewRow[] = []
  for (const row of preview) {
    if (row.status === 'already_linked') { linked.push(row.tenantId); continue }
    if (row.status !== 'ok') { conflicts.push(row); continue }
    // Alcance viejo de esta marca en membresías de la org (de una desvinculación
    // a medias): se limpia ANTES de vincular para que no reabra acceso.
    await OrgMembership.updateMany(
      { organizationId: org._id },
      { $pull: { 'scope.tenantIds': toId(row.tenantId), 'scope.locations': { tenantId: toId(row.tenantId) } } },
    )
    const res = await Tenant.updateOne(
      { _id: row.tenantId, status: { $ne: 'deleted' }, $or: [{ organizationId: { $exists: false } }, { organizationId: null }] },
      { $set: { organizationId: org._id } },
    )
    if (res.modifiedCount === 1) {
      linked.push(row.tenantId)
      await audit(org._id, actor, 'org.tenant.linked', 'tenant', row.tenantId, { slug: row.slug })
    } else {
      conflicts.push({ ...row, status: 'other_org' })
    }
  }
  if (linked.length) await bumpVersion(org._id)
  return { linked, conflicts }
}

/** Cuántas membresías pierden alcance si se desvincula la marca. */
export async function previewUnlink(orgId: string, tenantId: string) {
  const org = await loadOrg(orgId)
  if (!isId(tenantId)) throw new OrgError(400, 'invalid_tenant', 'Marca inválida.')
  const affected = await OrgMembership.countDocuments({
    organizationId: org._id, status: 'active',
    $or: [{ 'scope.tenantIds': toId(tenantId) }, { 'scope.locations.tenantId': toId(tenantId) }],
  })
  return { affectedMemberships: affected }
}

export async function unlinkTenant(orgId: string, tenantId: string, actor: AuditActor) {
  const org = await loadOrg(orgId)
  const { affectedMemberships } = await previewUnlink(orgId, tenantId)
  const res = await Tenant.updateOne({ _id: tenantId, organizationId: org._id }, { $unset: { organizationId: 1 } })
  if (res.matchedCount === 0) throw new OrgError(404, 'not_linked', 'Esa marca no pertenece a la organización.')
  // Corta el acceso aunque lo siguiente fallara (sin organizationId no hay
  // proyección); la limpieza deja las membresías coherentes.
  await OrgMembership.updateMany(
    { organizationId: org._id },
    { $pull: { 'scope.tenantIds': toId(tenantId), 'scope.locations': { tenantId: toId(tenantId) } } },
  )
  await bumpVersion(org._id)
  await audit(org._id, actor, 'org.tenant.unlinked', 'tenant', tenantId, { affectedMemberships })
  return { unlinked: tenantId, affectedMemberships }
}

// ── Miembros ──────────────────────────────────────────────────────────────────

async function activeOwners(orgId: Types.ObjectId | string) {
  return OrgMembership.countDocuments({ organizationId: orgId, orgRole: 'owner', status: 'active' })
}

async function syncOwnerField(orgId: Types.ObjectId | string) {
  const owner = await OrgMembership.findOne({ organizationId: orgId, orgRole: 'owner', status: 'active' }).sort({ grantedAt: 1 }).select('userId').lean<{ userId: unknown }>()
  await Organization.updateOne({ _id: orgId }, { $set: { ownerUserId: owner?.userId ?? null } })
}

/** Alta directa de un usuario existente (por email). Para cuentas nuevas: invitación. */
/**
 * Una cuenta de staff cuyo comercio fue borrado no puede iniciar sesión
 * (lib/signin-guard.ts). Si se la invita o se la suma, la persona acepta y
 * después no puede entrar: se avisa antes. Los `member` no tienen comercio.
 */
const STAFF_ROLES = new Set(['admin', 'manager', 'operations_manager', 'kitchen_lead', 'staff', 'cashier', 'waiter', 'host', 'auditor'])

async function assertCanSignIn(user: { _id: Types.ObjectId; role: string; tenantId?: unknown }) {
  // Solo staff: depende de su comercio de origen para entrar. member,
  // superadmin, consumer y seller no se evalúan acá.
  if (!STAFF_ROLES.has(user.role)) return
  const { isSignInAllowed } = await import('@/lib/signin-guard')
  if (!(await isSignInAllowed(user))) {
    throw new OrgError(409, 'orphan_account',
      'Ese email es de una cuenta de un comercio dado de baja y no puede iniciar sesión. Invitá otro email o pedí a soporte que libere esa cuenta.')
  }
}

export async function addMember(orgId: string, input: { email?: unknown; orgRole?: unknown; scope?: ScopeBody; tenantRole?: unknown }, actor: AuditActor) {
  const org = await loadOrg(orgId)
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (!email) throw new OrgError(400, 'invalid_email', 'Indicá el email.')
  const orgRole = parseRole(input.orgRole)
  const scope = parseScope(input.scope)
  const tenantRole = parseTenantRole(input.tenantRole)
  await assertValidGrant(String(org._id), orgRole, scope, tenantRole)

  const user = await User.findOne({ email }).select('_id role isActive tenantId').lean<{ _id: Types.ObjectId; role: string; isActive?: boolean; tenantId?: Types.ObjectId | null }>()
  if (!user) throw new OrgError(404, 'user_not_found', 'No hay una cuenta con ese email. Mandale una invitación.')
  const eligible = checkEligibleUser(user)
  if (eligible) throw new OrgError(400, eligible.code, eligible.message)
  await assertCanSignIn(user)
  const priv = checkPrivilege(SUPERADMIN, { userId: String(user._id), orgRole, scope })
  if (priv) throw new OrgError(403, priv.code, priv.message)

  const existing = await OrgMembership.findOne({ organizationId: org._id, userId: user._id })
  if (existing && existing.status === 'active') throw new OrgError(409, 'already_member', 'Esa persona ya es miembro de la organización.')
  const doc = {
    orgRole, scope: toScopeDoc(scope), tenantRole, status: 'active' as const,
    grantedBy: idOrNull(actor.userId), grantedAt: new Date(),
    revokedAt: null, revokedBy: null, revokeReason: null,
  }
  let membership
  try {
    membership = existing
      ? await OrgMembership.findOneAndUpdate({ _id: existing._id, status: { $ne: 'active' } }, { $set: doc }, { new: true })
      : await OrgMembership.create({ organizationId: org._id, userId: user._id, ...doc })
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) throw new OrgError(409, 'already_member', 'Esa persona ya es miembro de la organización.')
    throw err
  }
  if (!membership) throw new OrgError(409, 'already_member', 'Esa persona ya es miembro de la organización.')
  if (orgRole === 'owner') await syncOwnerField(org._id)
  await bumpVersion(org._id)
  await audit(org._id, actor, 'org.membership.created', 'membership', String(membership._id), { userId: String(user._id), orgRole, scope, tenantRole })
  return membership
}

export async function updateMember(orgId: string, membershipId: string, input: { orgRole?: unknown; scope?: ScopeBody; tenantRole?: unknown; status?: unknown }, actor: AuditActor) {
  const org = await loadOrg(orgId)
  if (!isId(membershipId)) throw new OrgError(404, 'membership_not_found', 'Membresía no encontrada')
  const m = await OrgMembership.findOne({ _id: membershipId, organizationId: org._id })
  if (!m) throw new OrgError(404, 'membership_not_found', 'Membresía no encontrada')
  if (m.status === 'revoked') throw new OrgError(409, 'membership_revoked', 'La membresía está revocada. Volvé a dar el alta.')

  const current = { orgRole: m.orgRole as OrgRole, scope: scopeFromDoc(m.scope), status: m.status, tenantRole: m.tenantRole ?? null }
  const nextRole = input.orgRole !== undefined ? parseRole(input.orgRole) : current.orgRole
  const nextScope = input.scope !== undefined ? parseScope(input.scope) : current.scope
  const nextTenantRole = input.tenantRole !== undefined ? parseTenantRole(input.tenantRole) : (nextRole === 'brand_manager' ? current.tenantRole : null)
  let nextStatus = current.status
  if (input.status !== undefined) {
    if (input.status !== 'active' && input.status !== 'suspended') throw new OrgError(400, 'invalid_status', 'El estado debe ser active o suspended (para quitar, revocá).')
    nextStatus = input.status
  }
  await assertValidGrant(String(org._id), nextRole, nextScope, nextTenantRole)
  const lastOwner = checkLastOwner(current, { orgRole: nextRole, status: nextStatus }, await activeOwners(org._id))
  if (lastOwner) throw new OrgError(409, lastOwner.code, lastOwner.message)
  const priv = checkPrivilege(SUPERADMIN, { userId: String(m.userId), orgRole: nextRole, scope: nextScope, current })
  if (priv) throw new OrgError(403, priv.code, priv.message)

  const after = { orgRole: nextRole, scope: toScopeDoc(nextScope), tenantRole: nextTenantRole, status: nextStatus }
  // Condicional sobre el estado leído: si otro cambio entró en el medio, 409.
  const res = await OrgMembership.updateOne({ _id: m._id, status: current.status, orgRole: current.orgRole }, { $set: after })
  if (res.matchedCount === 0) throw new OrgError(409, 'concurrent_change', 'La membresía cambió mientras la editabas. Recargá e intentá de nuevo.')
  if (current.orgRole === 'owner' || nextRole === 'owner') await syncOwnerField(org._id)
  await bumpVersion(org._id)
  await audit(org._id, actor, 'org.membership.updated', 'membership', String(m._id), { before: current, after: { ...after, scope: nextScope } })
  return OrgMembership.findById(m._id)
}

export async function revokeMember(orgId: string, membershipId: string, reason: unknown, actor: AuditActor) {
  const org = await loadOrg(orgId)
  if (!isId(membershipId)) throw new OrgError(404, 'membership_not_found', 'Membresía no encontrada')
  const m = await OrgMembership.findOne({ _id: membershipId, organizationId: org._id })
  if (!m) throw new OrgError(404, 'membership_not_found', 'Membresía no encontrada')
  if (m.status === 'revoked') return m // idempotente
  const lastOwner = checkLastOwner({ orgRole: m.orgRole as OrgRole, status: m.status }, { orgRole: m.orgRole as OrgRole, status: 'revoked' }, await activeOwners(org._id))
  if (lastOwner) throw new OrgError(409, lastOwner.code, lastOwner.message)
  await OrgMembership.updateOne({ _id: m._id, status: { $ne: 'revoked' } }, {
    $set: { status: 'revoked', revokedAt: new Date(), revokedBy: idOrNull(actor.userId), revokeReason: typeof reason === 'string' ? reason.slice(0, 300) : null },
  })
  if (m.orgRole === 'owner') await syncOwnerField(org._id)
  await bumpVersion(org._id)
  await audit(org._id, actor, 'org.membership.revoked', 'membership', String(m._id), { userId: String(m.userId), orgRole: m.orgRole })
  return OrgMembership.findById(m._id)
}

// ── Invitaciones ──────────────────────────────────────────────────────────────

export const hashInvitationToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

export async function createInvitation(
  orgId: string,
  input: { email?: unknown; orgRole?: unknown; scope?: ScopeBody; tenantRole?: unknown },
  actor: AuditActor,
  opts: { baseUrl: string; send?: (to: string, orgName: string, acceptUrl: string) => Promise<void> },
) {
  const org = await loadOrg(orgId)
  if (org.status !== 'active') throw new OrgError(409, 'org_inactive', 'La organización está suspendida.')
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new OrgError(400, 'invalid_email', 'Email inválido.')
  const orgRole = parseRole(input.orgRole)
  const scope = parseScope(input.scope)
  const tenantRole = parseTenantRole(input.tenantRole)
  await assertValidGrant(String(org._id), orgRole, scope, tenantRole)

  const user = await User.findOne({ email }).select('_id role isActive tenantId').lean<{ _id: Types.ObjectId; role: string; isActive?: boolean; tenantId?: Types.ObjectId | null }>()
  if (user) {
    const eligible = checkEligibleUser(user)
    if (eligible) throw new OrgError(400, eligible.code, eligible.message)
    await assertCanSignIn(user)
    if (await OrgMembership.exists({ organizationId: org._id, userId: user._id, status: 'active' })) {
      throw new OrgError(409, 'already_member', 'Esa persona ya es miembro de la organización.')
    }
  }

  // Una sola invitación vigente por email: las anteriores se cancelan.
  await OrgInvitation.updateMany({ organizationId: org._id, email, status: 'pending' }, { $set: { status: 'cancelled' } })
  const token = crypto.randomBytes(32).toString('base64url')
  const invitation = await OrgInvitation.create({
    organizationId: org._id, email, orgRole, scope: toScopeDoc(scope), tenantRole,
    tokenHash: hashInvitationToken(token), invitedBy: idOrNull(actor.userId),
  })
  const acceptUrl = `${opts.baseUrl.replace(/\/$/, '')}/grupo/aceptar?token=${encodeURIComponent(token)}`
  let emailSent = false
  if (opts.send) {
    try {
      await opts.send(email, org.name, acceptUrl)
      emailSent = true
    } catch (err) {
      console.warn('[org-invitation] no se pudo mandar el email:', (err as Error)?.message)
    }
  }
  await audit(org._id, actor, 'org.invitation.created', 'invitation', String(invitation._id), { email, orgRole, scope, emailSent })
  // El token NO se devuelve: solo viaja en el email.
  return { invitation, emailSent }
}

export async function cancelInvitation(orgId: string, invitationId: string, actor: AuditActor) {
  const org = await loadOrg(orgId)
  if (!isId(invitationId)) throw new OrgError(404, 'invitation_not_found', 'Invitación no encontrada')
  const res = await OrgInvitation.updateOne({ _id: invitationId, organizationId: org._id, status: 'pending' }, { $set: { status: 'cancelled' } })
  if (res.matchedCount === 0) throw new OrgError(404, 'invitation_not_found', 'No hay una invitación pendiente con ese id.')
  await audit(org._id, actor, 'org.invitation.cancelled', 'invitation', invitationId, {})
  return { cancelled: invitationId }
}

async function pendingInvitation(token: unknown) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw new OrgError(404, 'invitation_not_found', 'La invitación no existe.')
  const inv = await OrgInvitation.findOne({ tokenHash: hashInvitationToken(token) })
  if (!inv) throw new OrgError(404, 'invitation_not_found', 'La invitación no existe.')
  if (inv.status === 'pending' && inv.expiresAt.getTime() <= Date.now()) {
    await OrgInvitation.updateOne({ _id: inv._id, status: 'pending' }, { $set: { status: 'expired' } })
    throw new OrgError(410, 'invitation_expired', 'La invitación venció. Pedí una nueva.')
  }
  if (inv.status === 'expired') throw new OrgError(410, 'invitation_expired', 'La invitación venció. Pedí una nueva.')
  if (inv.status !== 'pending') throw new OrgError(409, 'invitation_used', 'La invitación ya no está disponible.')
  return inv
}

/** Datos para la pantalla de aceptación (sin revelar el email completo). */
export async function previewInvitation(token: unknown) {
  const inv = await pendingInvitation(token)
  const org = await Organization.findById(inv.organizationId).select('name slug status').lean<{ name: string; slug: string; status: string }>()
  if (!org || org.status !== 'active') throw new OrgError(409, 'org_inactive', 'La organización no está disponible.')
  const [local, domain] = inv.email.split('@')
  const accountExists = Boolean(await User.exists({ email: inv.email }))
  return {
    organization: { name: org.name, slug: org.slug },
    orgRole: inv.orgRole,
    emailHint: `${local.slice(0, 2)}***@${domain}`,
    accountExists,
    expiresAt: inv.expiresAt,
  }
}

/**
 * Acepta con la sesión actual. El email de la cuenta (leído de la base, no del
 * JWT) debe coincidir con el invitado: un link reenviado no sirve a otra cuenta.
 * Un solo ganador ante dos aceptaciones simultáneas (transición condicional +
 * índice único de membresía).
 */
export async function acceptInvitation(token: unknown, sessionUserId: string | null | undefined) {
  if (!isId(sessionUserId)) throw new OrgError(401, 'no_session', 'Iniciá sesión para aceptar la invitación.')
  const inv = await pendingInvitation(token)
  const user = await User.findById(sessionUserId).select('_id email role isActive').lean<{ _id: Types.ObjectId; email: string; role: string; isActive?: boolean }>()
  if (!user) throw new OrgError(401, 'no_session', 'Iniciá sesión para aceptar la invitación.')
  if (String(user.email).trim().toLowerCase() !== inv.email) {
    throw new OrgError(403, 'email_mismatch', 'Esta invitación es para otra cuenta. Iniciá sesión con el email invitado.')
  }
  const eligible = checkEligibleUser(user)
  if (eligible) throw new OrgError(403, eligible.code, eligible.message)

  const org = await Organization.findById(inv.organizationId).select('_id status')
  if (!org || org.status !== 'active') throw new OrgError(409, 'org_inactive', 'La organización no está disponible.')
  // El alcance se revalida: una marca pudo desvincularse desde la invitación.
  const scope = scopeFromDoc(inv.scope)
  await assertValidGrant(String(org._id), inv.orgRole as OrgRole, scope, inv.tenantRole ?? null)

  // Transición condicional: un solo ganador.
  const won = await OrgInvitation.findOneAndUpdate(
    { _id: inv._id, status: 'pending', expiresAt: { $gt: new Date() } },
    { $set: { status: 'accepted', acceptedBy: user._id, acceptedAt: new Date() } },
    { new: true },
  )
  if (!won) throw new OrgError(409, 'invitation_used', 'La invitación ya no está disponible.')

  const doc = {
    orgRole: inv.orgRole, scope: toScopeDoc(scope), tenantRole: inv.tenantRole ?? null, status: 'active' as const,
    grantedBy: inv.invitedBy, grantedAt: new Date(), revokedAt: null, revokedBy: null, revokeReason: null,
  }
  try {
    const existing = await OrgMembership.findOne({ organizationId: org._id, userId: user._id })
    if (existing?.status === 'active') {
      // Ya era miembro: la invitación queda usada y no se pisa su rol.
      return { membershipId: String(existing._id), organizationId: String(org._id), alreadyMember: true }
    }
    const membership = existing
      ? await OrgMembership.findOneAndUpdate({ _id: existing._id }, { $set: doc }, { new: true })
      : await OrgMembership.create({ organizationId: org._id, userId: user._id, ...doc })
    if (inv.orgRole === 'owner') await syncOwnerField(org._id)
    await bumpVersion(org._id)
    await audit(org._id, { userId: String(user._id), name: user.email, role: user.role }, 'org.invitation.accepted', 'membership', String(membership!._id), { invitationId: String(inv._id), orgRole: inv.orgRole })
    return { membershipId: String(membership!._id), organizationId: String(org._id), alreadyMember: false }
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      const m = await OrgMembership.findOne({ organizationId: org._id, userId: user._id }).select('_id').lean<{ _id: unknown }>()
      return { membershipId: String(m?._id), organizationId: String(org._id), alreadyMember: true }
    }
    // Falló el alta: la invitación vuelve a quedar disponible.
    await OrgInvitation.updateOne({ _id: inv._id, status: 'accepted', acceptedBy: user._id }, { $set: { status: 'pending', acceptedBy: null, acceptedAt: null } })
    throw err
  }
}

/**
 * Alta de cuenta nueva desde la invitación: el token prueba que la persona
 * recibe ese email. Nace como `member` (sin comercio de origen) y acepta.
 */
export async function registerFromInvitation(token: unknown, input: { name?: unknown; password?: unknown }) {
  const inv = await pendingInvitation(token)
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (name.length < 2 || name.length > 100) throw new OrgError(400, 'invalid_name', 'Ingresá tu nombre.')
  const password = typeof input.password === 'string' ? input.password : ''
  if (password.length < 8 || password.length > 200) throw new OrgError(400, 'weak_password', 'La contraseña debe tener al menos 8 caracteres.')
  if (await User.exists({ email: inv.email })) {
    throw new OrgError(409, 'account_exists', 'Ya tenés una cuenta con ese email: iniciá sesión para aceptar.')
  }
  let user
  try {
    user = await User.create({ name, email: inv.email, password, role: 'member', tenantId: null, emailVerified: new Date() })
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) throw new OrgError(409, 'account_exists', 'Ya tenés una cuenta con ese email: iniciá sesión para aceptar.')
    throw err
  }
  return acceptInvitation(token, String(user._id))
}

// ── Lecturas para el superadmin ───────────────────────────────────────────────

export async function listOrganizations() {
  const orgs = await Organization.find({ status: { $ne: 'deleted' } }).sort({ createdAt: -1 }).lean()
  const ids = orgs.map(o => o._id)
  const [tenantCounts, memberCounts] = await Promise.all([
    Tenant.aggregate<{ _id: unknown; n: number }>([{ $match: { organizationId: { $in: ids } } }, { $group: { _id: '$organizationId', n: { $sum: 1 } } }]),
    OrgMembership.aggregate<{ _id: unknown; n: number }>([{ $match: { organizationId: { $in: ids }, status: 'active' } }, { $group: { _id: '$organizationId', n: { $sum: 1 } } }]),
  ])
  const tc = new Map(tenantCounts.map(r => [String(r._id), r.n]))
  const mc = new Map(memberCounts.map(r => [String(r._id), r.n]))
  return orgs.map(o => ({ ...o, tenants: tc.get(String(o._id)) ?? 0, members: mc.get(String(o._id)) ?? 0 }))
}

export async function getOrganizationDetail(orgId: string) {
  const org = await loadOrg(orgId)
  const [tenants, memberships, invitations] = await Promise.all([
    Tenant.find({ organizationId: org._id }).select('_id name slug status plan').lean(),
    OrgMembership.find({ organizationId: org._id, status: { $in: MEMBERSHIP_STATUSES.filter(s => s !== 'revoked') } })
      .populate('userId', 'name email role isActive').lean(),
    OrgInvitation.find({ organizationId: org._id, status: 'pending' }).select('-tokenHash').lean(),
  ])
  return { organization: org.toObject(), tenants, memberships, invitations }
}

