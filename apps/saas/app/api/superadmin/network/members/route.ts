import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { addMember } from '@/lib/network/admin'
import { networkContext, networkError, readBody } from '@/lib/network/http'

// POST { tenantId, canEmit?, canReceive?, notes? } — incorpora un comercio (queda pendiente).
export async function POST(request: NextRequest) {
  const ctx = await networkContext(request)
  if (!ctx.ok) return ctx.response
  try {
    await connectDB()
    return NextResponse.json({ member: await addMember(await readBody(request), ctx.actor) }, { status: 201 })
  } catch (err) {
    return networkError(err, 'member_add')
  }
}
