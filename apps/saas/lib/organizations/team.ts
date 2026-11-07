/**
 * lib/organizations/team.ts — «Equipo del grupo» en /grupo/[slug]/equipo.
 *
 * El propietario y el administrador general invitan y revocan a su gente sin
 * pasar por el superadmin. Los permisos son los de membership-rules
 * (checkPrivilege), aplicados por el servicio con el actor del miembro:
 *   · propietario → todo (nunca dejar la organización sin propietario);
 *   · administrador general → roles inferiores, dentro de su alcance;
 *   · el resto → no gestiona el equipo.
 * Todo se deriva en el servidor desde la sesión y la membresía activa.
 */
import { NextRequest, NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import { getSessionUser } from '@/lib/apiAuth'
import Organization from '@/models/Organization'
import OrgMembership, { type OrgRole } from '@/models/OrgMembership'
import type { AuditActor } from './service'

export const TEAM_MANAGER_ROLES: ReadonlySet<OrgRole> = new Set<OrgRole>(['owner', 'org_admin'])

export interface TeamContext {
  orgId: string
  orgName: string
  orgSlug: string
  orgRole: OrgRole
  actor: AuditActor
}

const scopeOf = (s?: { allTenants?: boolean; tenantIds?: unknown[]; locations?: { tenantId: unknown; locationId: unknown }[] }) => ({
  allTenants: Boolean(s?.allTenants),
  tenantIds: (s?.tenantIds ?? []).map(String),
  locations: (s?.locations ?? []).map(l => ({ tenantId: String(l.tenantId), locationId: String(l.locationId) })),
})

/**
 * Sesión → miembro activo de una organización activa con rol que gestiona el
 * equipo. Para quien no es miembro responde 404 (no confirma que exista).
 */
export async function teamContext(request: NextRequest, orgSlug: string): Promise<{ ok: true; ctx: TeamContext } | { ok: false; response: NextResponse }> {
  const user = await getSessionUser(request)
  if (!user?.id) return { ok: false, response: NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 }) }
  if (!/^[a-f0-9]{24}$/i.test(String(user.id)) || !/^[a-z0-9-]{2,60}$/.test(orgSlug)) {
    return { ok: false, response: NextResponse.json({ error: 'No encontrado' }, { status: 404 }) }
  }
  await connectDB()
  const org = await Organization.findOne({ slug: orgSlug, status: 'active' }).select('_id name slug').lean<{ _id: Types.ObjectId; name: string; slug: string }>()
  const m = org
    ? await OrgMembership.findOne({ organizationId: org._id, userId: new Types.ObjectId(String(user.id)), status: 'active' })
        .select('orgRole scope').lean<{ orgRole: OrgRole; scope?: Parameters<typeof scopeOf>[0] }>()
    : null
  if (!org || !m) return { ok: false, response: NextResponse.json({ error: 'No encontrado' }, { status: 404 }) }
  if (!TEAM_MANAGER_ROLES.has(m.orgRole)) {
    return { ok: false, response: NextResponse.json({ error: 'Tu rol no gestiona el equipo de la organización.', code: 'forbidden_privilege' }, { status: 403 }) }
  }
  const u = user as { id: string; name?: string | null; email?: string | null }
  return {
    ok: true,
    ctx: {
      orgId: String(org._id), orgName: org.name, orgSlug: org.slug, orgRole: m.orgRole,
      actor: {
        userId: u.id,
        name: u.name ?? u.email ?? 'Miembro',
        role: `org:${m.orgRole}`,
        privilege: { kind: 'member', userId: u.id, orgRole: m.orgRole, scope: scopeOf(m.scope) },
      },
    },
  }
}
