import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { getOrganizationDetail, updateOrganization } from '@/lib/organizations/service'
import { orgErrorResponse, readJson, superadminContext } from '@/lib/organizations/http'

// Multi-marca PR 9a — GET: detalle (marcas, miembros, invitaciones pendientes)
// · PATCH { name?, status?: 'active' | 'suspended', legalNote? }.
// Suspender corta todas las membresías; los accesos de origen siguen.

type Params = { params: Promise<{ orgId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const ctx = await superadminContext(request)
  if (!ctx.ok) return ctx.response
  try {
    await connectDB()
    const { orgId } = await params
    return NextResponse.json(await getOrganizationDetail(orgId))
  } catch (err) {
    return orgErrorResponse(err, 'detail')
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await superadminContext(request)
  if (!ctx.ok) return ctx.response
  try {
    await connectDB()
    const { orgId } = await params
    const org = await updateOrganization(orgId, await readJson(request), ctx.actor)
    return NextResponse.json({ organization: org })
  } catch (err) {
    return orgErrorResponse(err, 'update')
  }
}
