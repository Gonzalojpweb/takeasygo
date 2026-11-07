import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { addMember, getOrganizationDetail } from '@/lib/organizations/service'
import { orgErrorResponse, readJson, superadminContext } from '@/lib/organizations/http'

// Multi-marca PR 9a — GET: miembros · POST { email, orgRole, scope, tenantRole? }:
// alta directa de una cuenta EXISTENTE (para cuentas nuevas, invitación).

type Params = { params: Promise<{ orgId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const ctx = await superadminContext(request)
  if (!ctx.ok) return ctx.response
  try {
    await connectDB()
    const { orgId } = await params
    const { memberships } = await getOrganizationDetail(orgId)
    return NextResponse.json({ memberships })
  } catch (err) {
    return orgErrorResponse(err, 'members')
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await superadminContext(request)
  if (!ctx.ok) return ctx.response
  try {
    await connectDB()
    const { orgId } = await params
    const membership = await addMember(orgId, await readJson(request), ctx.actor)
    return NextResponse.json({ membership }, { status: 201 })
  } catch (err) {
    return orgErrorResponse(err, 'add-member')
  }
}
