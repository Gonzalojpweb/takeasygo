import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import { pilotMetrics } from '@/lib/network/pilot'
import { networkContext, networkError } from '@/lib/network/http'

// GET — métricas del piloto de una campaña (beneficio vs control, por personas).
// Solo SuperAdmin: el emisor nunca ve compras ni datos del receptor.
export async function GET(request: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  const ctx = await networkContext(request)
  if (!ctx.ok) return ctx.response
  try {
    const { campaignId } = await params
    if (!mongoose.isValidObjectId(campaignId)) return NextResponse.json({ error: 'Campaña inválida' }, { status: 400 })
    await connectDB()
    return NextResponse.json({ metrics: await pilotMetrics(campaignId) })
  } catch (err) {
    return networkError(err, 'pilot_metrics')
  }
}
