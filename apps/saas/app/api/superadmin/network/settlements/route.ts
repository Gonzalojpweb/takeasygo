import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { superadminSettlements } from '@/lib/network/settlements'
import { networkContext, networkError } from '@/lib/network/http'

// GET — liquidaciones de comisiones de red y deuda por comercio (solo SuperAdmin).
export async function GET(request: NextRequest) {
  const ctx = await networkContext(request)
  if (!ctx.ok) return ctx.response
  try {
    await connectDB()
    return NextResponse.json(await superadminSettlements())
  } catch (err) {
    return networkError(err, 'settlements')
  }
}
