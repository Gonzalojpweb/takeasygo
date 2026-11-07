import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { linkTenants, previewLink, previewUnlink, unlinkTenant } from '@/lib/organizations/service'
import { orgErrorResponse, readJson, superadminContext } from '@/lib/organizations/http'

// Multi-marca PR 9a — vincular y desvincular marcas.
// POST   { tenantIds: string[] } (?preview=1 → solo informa) · condicional:
//        una marca ya vinculada a otra organización no se pisa (conflicts).
// DELETE { tenantId } (?preview=1 → cuántas membresías pierden alcance).

type Params = { params: Promise<{ orgId: string }> }
const isPreview = (request: NextRequest) => request.nextUrl.searchParams.get('preview') === '1'

export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await superadminContext(request)
  if (!ctx.ok) return ctx.response
  try {
    await connectDB()
    const { orgId } = await params
    const { tenantIds } = await readJson(request)
    if (isPreview(request)) return NextResponse.json({ preview: await previewLink(orgId, tenantIds) })
    return NextResponse.json(await linkTenants(orgId, tenantIds, ctx.actor))
  } catch (err) {
    return orgErrorResponse(err, 'link')
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const ctx = await superadminContext(request)
  if (!ctx.ok) return ctx.response
  try {
    await connectDB()
    const { orgId } = await params
    const { tenantId } = await readJson(request)
    const id = typeof tenantId === 'string' ? tenantId : ''
    if (isPreview(request)) return NextResponse.json(await previewUnlink(orgId, id))
    return NextResponse.json(await unlinkTenant(orgId, id, ctx.actor))
  } catch (err) {
    return orgErrorResponse(err, 'unlink')
  }
}
