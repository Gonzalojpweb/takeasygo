import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { networkOverview } from '@/lib/network/admin'
import { networkContext, networkError } from '@/lib/network/http'

// GET — vista general de la red de beneficios (solo SuperAdmin).
export async function GET(request: NextRequest) {
  const ctx = await networkContext(request)
  if (!ctx.ok) return ctx.response
  try {
    await connectDB()
    return NextResponse.json(await networkOverview())
  } catch (err) {
    return networkError(err, 'overview')
  }
}
