import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { rateLimit } from '@/lib/rateLimit'
import { claimBenefit } from '@/lib/network/engine'
import { benefitErrorResponse, consumerUserId } from '@/lib/network/consumer-http'

// POST { token } — guarda en la cuenta un beneficio emitido sin cuenta (mismo email del pedido).
export async function POST(request: NextRequest) {
  try {
    const userId = await consumerUserId()
    if (userId) {
      const { success } = await rateLimit(`network-claim:${userId}`, 10, 60_000)
      if (!success) return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429 })
    }
    const body = await request.json().catch(() => ({}))
    await connectDB()
    const benefit = await claimBenefit(userId ?? '', (body as { token?: unknown }).token)
    return NextResponse.json({ claimed: true, benefitId: String(benefit._id) })
  } catch (err) {
    return benefitErrorResponse(err, 'claim')
  }
}
