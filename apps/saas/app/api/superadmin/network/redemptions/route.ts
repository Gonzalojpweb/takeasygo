import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { superadminRedemptions } from '@/lib/network/engine'
import { networkContext, networkError } from '@/lib/network/http'

// GET — registro completo de canjes de la red (§6.3): emisor, receptor,
// consumidor, beneficio, importes, comisión, versión del acuerdo y reversiones.
export async function GET(request: NextRequest) {
  const ctx = await networkContext(request)
  if (!ctx.ok) return ctx.response
  try {
    await connectDB()
    return NextResponse.json({ redemptions: await superadminRedemptions() })
  } catch (err) {
    return networkError(err, 'redemptions')
  }
}
