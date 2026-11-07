import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { cancelInvitation } from '@/lib/organizations/service'
import { orgErrorResponse, superadminContext } from '@/lib/organizations/http'

// Multi-marca PR 9a — DELETE: cancela una invitación pendiente.

type Params = { params: Promise<{ orgId: string; invitationId: string }> }

export async function DELETE(request: NextRequest, { params }: Params) {
  const ctx = await superadminContext(request)
  if (!ctx.ok) return ctx.response
  try {
    await connectDB()
    const { orgId, invitationId } = await params
    return NextResponse.json(await cancelInvitation(orgId, invitationId, ctx.actor))
  } catch (err) {
    return orgErrorResponse(err, 'cancel-invitation')
  }
}
