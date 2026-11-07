import { NextRequest, NextResponse } from 'next/server'
import { teamContext } from '@/lib/organizations/team'
import { cancelInvitation } from '@/lib/organizations/service'
import { orgErrorResponse } from '@/lib/organizations/http'

// DELETE /api/grupo/[slug]/equipo/invitaciones/[invitationId] — cancela una invitación pendiente.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slug: string; invitationId: string }> }) {
  const { slug, invitationId } = await params
  const team = await teamContext(request, slug)
  if (!team.ok) return team.response
  try {
    return NextResponse.json(await cancelInvitation(team.ctx.orgId, invitationId, team.ctx.actor))
  } catch (err) {
    return orgErrorResponse(err, 'grupo/equipo cancelar invitación')
  }
}
