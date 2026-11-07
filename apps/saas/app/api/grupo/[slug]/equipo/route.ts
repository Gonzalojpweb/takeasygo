import { NextRequest, NextResponse } from 'next/server'
import { teamContext } from '@/lib/organizations/team'
import { getOrganizationDetail } from '@/lib/organizations/service'
import { orgErrorResponse } from '@/lib/organizations/http'

// ============================================================================
// GET /api/grupo/[slug]/equipo — equipo del grupo (propietario y administrador
// general). Marcas con sus sedes, miembros e invitaciones pendientes. Sin
// tokens ni datos de más: nombre, email, rol y alcance.
// ============================================================================

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const team = await teamContext(request, (await params).slug)
  if (!team.ok) return team.response
  try {
    const d = await getOrganizationDetail(team.ctx.orgId)
    return NextResponse.json({
      organization: { name: team.ctx.orgName, slug: team.ctx.orgSlug },
      myRole: team.ctx.orgRole,
      myUserId: team.ctx.actor.userId,
      tenants: d.tenants.filter(t => t.status !== 'deleted').map(t => ({ _id: String(t._id), name: t.name, slug: t.slug, locations: t.locations })),
      memberships: d.memberships.map(m => {
        const u = m.userId as unknown as { _id?: unknown; name?: string; email?: string } | null
        return {
          _id: String(m._id), orgRole: m.orgRole, status: m.status, tenantRole: m.tenantRole ?? null,
          scope: m.scope, user: u ? { _id: String(u._id), name: u.name ?? '', email: u.email ?? '' } : null,
        }
      }),
      invitations: d.invitations.map(i => ({ _id: String(i._id), email: i.email, orgRole: i.orgRole, scope: i.scope, expiresAt: i.expiresAt })),
    })
  } catch (err) {
    return orgErrorResponse(err, 'grupo/equipo GET')
  }
}
