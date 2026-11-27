import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { setRelationStatus } from '@/lib/network/admin'
import { networkContext, networkError, readBody } from '@/lib/network/http'

// PATCH { status: active | paused }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ relationId: string }> }) {
  const ctx = await networkContext(request)
  if (!ctx.ok) return ctx.response
  try {
    const { relationId } = await params
    await connectDB()
    return NextResponse.json({ relation: await setRelationStatus(relationId, await readBody(request), ctx.actor) })
  } catch (err) {
    return networkError(err, 'relation_status')
  }
}
