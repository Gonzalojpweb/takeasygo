import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { createCampaign } from '@/lib/network/admin'
import { networkContext, networkError, readBody } from '@/lib/network/http'

// POST — registra una campaña de beneficio de un comercio receptor.
export async function POST(request: NextRequest) {
  const ctx = await networkContext(request)
  if (!ctx.ok) return ctx.response
  try {
    await connectDB()
    return NextResponse.json({ campaign: await createCampaign(await readBody(request), ctx.actor) }, { status: 201 })
  } catch (err) {
    return networkError(err, 'campaign_create')
  }
}
