import { NextRequest, NextResponse } from 'next/server'
import { teamContext } from '@/lib/organizations/team'
import { revokeMember } from '@/lib/organizations/service'
import { orgErrorResponse, readJson } from '@/lib/organizations/http'

// DELETE /api/grupo/[slug]/equipo/miembros/[membershipId] { reason? } — revoca
// una membresía con los permisos del miembro. Nunca deja el grupo sin propietario.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slug: string; membershipId: string }> }) {
  const { slug, membershipId } = await params
  const team = await teamContext(request, slug)
  if (!team.ok) return team.response
  try {
    const body = await readJson(request)
    const m = await revokeMember(team.ctx.orgId, membershipId, body.reason, team.ctx.actor)
    return NextResponse.json({ membership: { _id: String(m?._id), status: m?.status } })
  } catch (err) {
    return orgErrorResponse(err, 'grupo/equipo revocar')
  }
}
