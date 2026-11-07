import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { revokeMember, updateMember } from '@/lib/organizations/service'
import { orgErrorResponse, readJson, superadminContext } from '@/lib/organizations/http'

// Multi-marca PR 9a — PATCH { orgRole?, scope?, tenantRole?, status?: 'active' | 'suspended' }
// · DELETE { reason? }: revoca. Nunca deja la organización sin propietario activo.

type Params = { params: Promise<{ orgId: string; membershipId: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await superadminContext(request)
  if (!ctx.ok) return ctx.response
  try {
    await connectDB()
    const { orgId, membershipId } = await params
    const membership = await updateMember(orgId, membershipId, await readJson(request), ctx.actor)
    return NextResponse.json({ membership })
  } catch (err) {
    return orgErrorResponse(err, 'update-member')
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const ctx = await superadminContext(request)
  if (!ctx.ok) return ctx.response
  try {
    await connectDB()
    const { orgId, membershipId } = await params
    const { reason } = await readJson(request)
    const membership = await revokeMember(orgId, membershipId, reason, ctx.actor)
    return NextResponse.json({ membership })
  } catch (err) {
    return orgErrorResponse(err, 'revoke-member')
  }
}
