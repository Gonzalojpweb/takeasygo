import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { updateMember } from '@/lib/network/admin'
import { networkContext, networkError, readBody } from '@/lib/network/http'

// PATCH { action: approve | suspend | reactivate | suspend_receiving | resume_receiving | permissions, ... }
// Suspender la recepción solo corta beneficios nuevos hacia el comercio (no su SaaS).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const ctx = await networkContext(request)
  if (!ctx.ok) return ctx.response
  try {
    const { tenantId } = await params
    await connectDB()
    return NextResponse.json({ member: await updateMember(tenantId, await readBody(request), ctx.actor) })
  } catch (err) {
    return networkError(err, 'member_update')
  }
}
