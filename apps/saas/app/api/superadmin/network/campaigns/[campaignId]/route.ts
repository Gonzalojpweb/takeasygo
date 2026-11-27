import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { updateCampaign } from '@/lib/network/admin'
import { networkContext, networkError, readBody } from '@/lib/network/http'

// PUT — edita la campaña (el receptor no cambia).
export async function PUT(request: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  const ctx = await networkContext(request)
  if (!ctx.ok) return ctx.response
  try {
    const { campaignId } = await params
    await connectDB()
    return NextResponse.json({ campaign: await updateCampaign(campaignId, await readBody(request), ctx.actor) })
  } catch (err) {
    return networkError(err, 'campaign_update')
  }
}
