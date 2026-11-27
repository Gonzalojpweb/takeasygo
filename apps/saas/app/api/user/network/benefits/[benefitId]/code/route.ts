import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { rateLimit } from '@/lib/rateLimit'
import { currentBenefitCode } from '@/lib/network/engine'
import { benefitErrorResponse, consumerUserId } from '@/lib/network/consumer-http'

// GET — código vigente del QR dinámico (cambia cada 30 s). Solo el dueño del beneficio.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ benefitId: string }> }) {
  try {
    const userId = await consumerUserId()
    if (userId) {
      const { success } = await rateLimit(`network-code:${userId}`, 30, 60_000)
      if (!success) return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429 })
    }
    const { benefitId } = await params
    await connectDB()
    const code = await currentBenefitCode(userId ?? '', benefitId)
    return NextResponse.json(code, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return benefitErrorResponse(err, 'code')
  }
}
