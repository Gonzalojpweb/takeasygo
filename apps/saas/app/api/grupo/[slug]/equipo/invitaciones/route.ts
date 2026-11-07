import { NextRequest, NextResponse } from 'next/server'
import { teamContext } from '@/lib/organizations/team'
import { createInvitation } from '@/lib/organizations/service'
import { appBaseUrl, orgErrorResponse, readJson } from '@/lib/organizations/http'
import { sendOrgInvitationEmail } from '@/lib/email'

// POST /api/grupo/[slug]/equipo/invitaciones { email, orgRole, scope, tenantRole? }
// Invita con los permisos del miembro (checkPrivilege en el servicio). El token
// viaja solo en el email; la respuesta no lo incluye.
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const team = await teamContext(request, (await params).slug)
  if (!team.ok) return team.response
  try {
    const body = await readJson(request)
    const { invitation, emailSent } = await createInvitation(
      team.ctx.orgId,
      { email: body.email, orgRole: body.orgRole, scope: body.scope as never, tenantRole: body.tenantRole },
      team.ctx.actor,
      { baseUrl: appBaseUrl(request), send: (to, orgName, url) => sendOrgInvitationEmail(to, orgName, url) },
    )
    return NextResponse.json({ invitation: { _id: String(invitation._id), email: invitation.email, orgRole: invitation.orgRole, expiresAt: invitation.expiresAt }, emailSent }, { status: 201 })
  } catch (err) {
    return orgErrorResponse(err, 'grupo/equipo invitar')
  }
}
