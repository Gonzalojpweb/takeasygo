import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { createInvitation } from '@/lib/organizations/service'
import { appBaseUrl, orgErrorResponse, readJson, superadminContext } from '@/lib/organizations/http'
import { sendOrgInvitationEmail } from '@/lib/email'

// Multi-marca PR 9a — POST { email, orgRole, scope, tenantRole? }: invita.
// El token viaja SOLO en el email (acá se guarda su SHA-256 y no se devuelve).
// Si el email falla, `emailSent: false`: cancelar y volver a invitar.

type Params = { params: Promise<{ orgId: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await superadminContext(request)
  if (!ctx.ok) return ctx.response
  try {
    await connectDB()
    const { orgId } = await params
    const { invitation, emailSent } = await createInvitation(orgId, await readJson(request), ctx.actor, {
      baseUrl: appBaseUrl(request),
      send: sendOrgInvitationEmail,
    })
    const { tokenHash: _omit, ...safe } = invitation.toObject()
    return NextResponse.json({ invitation: safe, emailSent }, { status: 201 })
  } catch (err) {
    return orgErrorResponse(err, 'invite')
  }
}
