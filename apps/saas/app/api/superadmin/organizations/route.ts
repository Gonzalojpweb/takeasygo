import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { createOrganization, listOrganizations } from '@/lib/organizations/service'
import { orgErrorResponse, readJson, superadminContext } from '@/lib/organizations/http'

// Multi-marca PR 9a — GET: listado · POST { name, slug, legalNote? }: alta.
// Solo superadmin (D7). Diseño §8.2.

export async function GET(request: NextRequest) {
  const ctx = await superadminContext(request)
  if (!ctx.ok) return ctx.response
  try {
    await connectDB()
    return NextResponse.json({ organizations: await listOrganizations() })
  } catch (err) {
    return orgErrorResponse(err, 'list')
  }
}

export async function POST(request: NextRequest) {
  const ctx = await superadminContext(request)
  if (!ctx.ok) return ctx.response
  try {
    await connectDB()
    const org = await createOrganization(await readJson(request), ctx.actor)
    return NextResponse.json({ organization: org }, { status: 201 })
  } catch (err) {
    return orgErrorResponse(err, 'create')
  }
}
