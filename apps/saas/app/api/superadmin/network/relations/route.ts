import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { createRelation } from '@/lib/network/admin'
import { networkContext, networkError, readBody } from '@/lib/network/http'

// POST { emitterTenantId, receiverTenantId, note? } — autoriza una dirección (la inversa es otra relación).
export async function POST(request: NextRequest) {
  const ctx = await networkContext(request)
  if (!ctx.ok) return ctx.response
  try {
    await connectDB()
    return NextResponse.json({ relation: await createRelation(await readBody(request), ctx.actor) }, { status: 201 })
  } catch (err) {
    return networkError(err, 'relation_create')
  }
}
