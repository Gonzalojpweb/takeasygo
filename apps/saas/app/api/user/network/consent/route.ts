import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { getNetworkConsent, setNetworkConsent } from '@/lib/network/engine'
import { benefitErrorResponse, consumerUserId } from '@/lib/network/consumer-http'

// GET — ¿el consumidor recibe beneficios de la red? · POST { optOut } — revocar o volver a aceptar (§5).
export async function GET() {
  try {
    await connectDB()
    return NextResponse.json(await getNetworkConsent((await consumerUserId()) ?? ''))
  } catch (err) {
    return benefitErrorResponse(err, 'consent_get')
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { optOut?: unknown }
    if (typeof body.optOut !== 'boolean') return NextResponse.json({ error: 'Indicá si querés recibir beneficios' }, { status: 400 })
    await connectDB()
    return NextResponse.json(await setNetworkConsent((await consumerUserId()) ?? '', body.optOut))
  } catch (err) {
    return benefitErrorResponse(err, 'consent_set')
  }
}
